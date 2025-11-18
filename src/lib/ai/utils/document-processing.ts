/**
 * Document Processing Utility
 * Ingestion pipeline for various document types
 */

import pdf from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";
import { storeDocumentChunks } from "./vector-store";
import prisma from "@/lib/prisma";

/**
 * Supported document types
 */
export const SUPPORTED_FILE_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "text/plain",
  "text/markdown",
] as const;

export interface DocumentMetadata {
  title: string;
  description?: string;
  subject?: string;
  gradeLevel?: number;
  classId?: number;
  subjectId?: number;
  uploadedBy: string;
  uploadedByRole: string;
  isPublic: boolean;
}

/**
 * Process uploaded document
 */
export async function processDocument(
  fileBuffer: Buffer,
  fileType: string,
  fileUrl: string,
  metadata: DocumentMetadata
) {
  try {
    console.log(`Processing document: ${metadata.title}`);

    // Extract text based on file type
    let extractedText: string;

    if (fileType === "application/pdf") {
      extractedText = await extractTextFromPDF(fileBuffer);
    } else if (
      fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      extractedText = await extractTextFromDocx(fileBuffer);
    } else if (fileType === "text/plain" || fileType === "text/markdown") {
      extractedText = fileBuffer.toString("utf-8");
    } else {
      throw new Error(`Unsupported file type: ${fileType}`);
    }

    // Clean extracted text
    const cleanedText = cleanText(extractedText);

    // Chunk the document
    const chunks = chunkDocument(cleanedText, {
      chunkSize: 1000,
      chunkOverlap: 200,
      documentTitle: metadata.title,
    });

    console.log(`Created ${chunks.length} chunks from document`);

    // Store document in database
    const document = await prisma.aIDocument.create({
      data: {
        title: metadata.title,
        description: metadata.description,
        fileUrl,
        fileType,
        subject: metadata.subject,
        gradeLevel: metadata.gradeLevel,
        uploadedBy: metadata.uploadedBy,
        uploadedByRole: metadata.uploadedByRole,
        isPublic: metadata.isPublic,
        classId: metadata.classId,
        subjectId: metadata.subjectId,
        metadata: {
          originalSize: fileBuffer.length,
          extractedTextLength: cleanedText.length,
          chunksCount: chunks.length,
        },
      },
    });

    // Store chunks with embeddings
    await storeDocumentChunks(document.id, chunks);

    console.log(`Document processed successfully: ${document.id}`);

    return {
      success: true,
      documentId: document.id,
      chunksCreated: chunks.length,
      textLength: cleanedText.length,
    };
  } catch (error: any) {
    console.error("Error processing document:", error);
    throw new Error(`Document processing failed: ${error.message}`);
  }
}

/**
 * Extract text from PDF
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    throw new Error("Failed to extract text from PDF");
  }
}

/**
 * Extract text from DOCX
 */
async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error("Error extracting text from DOCX:", error);
    throw new Error("Failed to extract text from DOCX");
  }
}

/**
 * Clean extracted text
 */
function cleanText(text: string): string {
  return (
    text
      // Remove excessive whitespace
      .replace(/\s+/g, " ")
      // Remove page numbers (common patterns)
      .replace(/\bPage \d+\b/gi, "")
      // Remove repeated special characters
      .replace(/([^\w\s])\1{3,}/g, "$1")
      // Trim
      .trim()
  );
}

/**
 * Chunk document into smaller pieces
 */
function chunkDocument(
  text: string,
  options: {
    chunkSize: number;
    chunkOverlap: number;
    documentTitle: string;
  }
): Array<{ content: string; metadata: any; chunkIndex: number }> {
  const { chunkSize, chunkOverlap, documentTitle } = options;

  // Split by sentences first
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  const chunks: Array<{ content: string; metadata: any; chunkIndex: number }> = [];
  let currentChunk = "";
  let chunkIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i].trim();

    if ((currentChunk + " " + sentence).length <= chunkSize) {
      currentChunk += (currentChunk ? " " : "") + sentence;
    } else {
      if (currentChunk) {
        chunks.push({
          content: currentChunk,
          metadata: {
            documentTitle,
            chunkIndex,
            sentenceStart: Math.max(0, i - 5),
            sentenceEnd: i,
          },
          chunkIndex,
        });
        chunkIndex++;
      }

      // Start new chunk with overlap
      const overlapSentences = sentences.slice(Math.max(0, i - 2), i);
      currentChunk = overlapSentences.join(" ") + " " + sentence;
    }
  }

  // Add final chunk
  if (currentChunk) {
    chunks.push({
      content: currentChunk,
      metadata: {
        documentTitle,
        chunkIndex,
        sentenceStart: Math.max(0, sentences.length - 5),
        sentenceEnd: sentences.length,
      },
      chunkIndex,
    });
  }

  return chunks;
}

/**
 * Semantic chunking (group related content)
 */
export async function semanticChunkDocument(
  text: string,
  documentTitle: string
): Promise<Array<{ content: string; metadata: any; chunkIndex: number }>> {
  // Split by sections (headings, double line breaks)
  const sections = text.split(/\n\n+|(?=^#{1,6}\s)/m);

  const chunks: Array<{ content: string; metadata: any; chunkIndex: number }> = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const trimmedSection = section.trim();
    if (!trimmedSection || trimmedSection.length < 50) continue;

    // If section is too large, use regular chunking
    if (trimmedSection.length > 1500) {
      const subChunks = chunkDocument(trimmedSection, {
        chunkSize: 1000,
        chunkOverlap: 200,
        documentTitle,
      });

      subChunks.forEach((subChunk) => {
        chunks.push({
          ...subChunk,
          chunkIndex: chunkIndex++,
        });
      });
    } else {
      chunks.push({
        content: trimmedSection,
        metadata: {
          documentTitle,
          chunkIndex,
          type: "semantic_section",
        },
        chunkIndex,
      });
      chunkIndex++;
    }
  }

  return chunks;
}

/**
 * Delete document and all its chunks
 */
export async function deleteDocument(documentId: string, userId: string) {
  try {
    // Verify ownership
    const document = await prisma.aIDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    if (document.uploadedBy !== userId) {
      throw new Error("Unauthorized to delete this document");
    }

    // Delete document (chunks will be cascade deleted)
    await prisma.aIDocument.delete({
      where: { id: documentId },
    });

    console.log(`Deleted document: ${documentId}`);

    return { success: true };
  } catch (error: any) {
    console.error("Error deleting document:", error);
    throw error;
  }
}

/**
 * Update document metadata
 */
export async function updateDocumentMetadata(
  documentId: string,
  userId: string,
  updates: {
    title?: string;
    description?: string;
    subject?: string;
    gradeLevel?: number;
    isPublic?: boolean;
  }
) {
  try {
    // Verify ownership
    const document = await prisma.aIDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error("Document not found");
    }

    if (document.uploadedBy !== userId) {
      throw new Error("Unauthorized to update this document");
    }

    // Update document
    const updatedDocument = await prisma.aIDocument.update({
      where: { id: documentId },
      data: updates,
    });

    return { success: true, document: updatedDocument };
  } catch (error: any) {
    console.error("Error updating document:", error);
    throw error;
  }
}

/**
 * Get documents for a user
 */
export async function getUserDocuments(
  userId: string,
  userRole: "teacher" | "student" | "admin",
  filters?: {
    subject?: string;
    gradeLevel?: number;
    classId?: number;
  }
) {
  try {
    const whereClause: any = {};

    // Teachers and admins see their own documents
    // Students see only public documents
    if (userRole === "teacher" || userRole === "admin") {
      whereClause.uploadedBy = userId;
    } else {
      whereClause.isPublic = true;
    }

    // Apply filters
    if (filters?.subject) whereClause.subject = filters.subject;
    if (filters?.gradeLevel) whereClause.gradeLevel = filters.gradeLevel;
    if (filters?.classId) whereClause.classId = filters.classId;

    const documents = await prisma.aIDocument.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });

    return documents;
  } catch (error) {
    console.error("Error getting user documents:", error);
    return [];
  }
}

/**
 * Get document statistics
 */
export async function getDocumentStats(userId?: string) {
  try {
    const whereClause: any = userId ? { uploadedBy: userId } : {};

    const totalDocuments = await prisma.aIDocument.count({
      where: whereClause,
    });

    const totalChunks = await prisma.aIDocumentChunk.count({
      where: userId
        ? {
            document: {
              uploadedBy: userId,
            },
          }
        : undefined,
    });

    const subjectBreakdown = await prisma.aIDocument.groupBy({
      by: ["subject"],
      where: whereClause,
      _count: true,
    });

    const gradeBreakdown = await prisma.aIDocument.groupBy({
      by: ["gradeLevel"],
      where: whereClause,
      _count: true,
    });

    return {
      totalDocuments,
      totalChunks,
      avgChunksPerDocument: totalDocuments > 0 ? totalChunks / totalDocuments : 0,
      subjectBreakdown: subjectBreakdown.map((s) => ({
        subject: s.subject,
        count: s._count,
      })),
      gradeBreakdown: gradeBreakdown.map((g) => ({
        gradeLevel: g.gradeLevel,
        count: g._count,
      })),
    };
  } catch (error) {
    console.error("Error getting document stats:", error);
    return null;
  }
}
