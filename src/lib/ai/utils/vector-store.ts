/**
 * Vector Store Utilities
 * Handles document embedding and retrieval
 */

import { OpenAIEmbeddings } from "@langchain/openai";
import prisma from "@/lib/prisma";

// Initialize embeddings model
const embeddings = new OpenAIEmbeddings({
  modelName: "text-embedding-3-small",
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate embedding for text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const embedding = await embeddings.embedQuery(text);
    return embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error("Vectors must have same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Retrieve relevant documents from vector store
 */
export async function retrieveDocuments(
  query: string,
  options: {
    subject?: string;
    gradeLevel?: number;
    userRole: "teacher" | "student";
    topK?: number;
  }
) {
  const { subject, gradeLevel, userRole, topK = 5 } = options;

  try {
    // Generate query embedding
    const queryEmbedding = await generateEmbedding(query);

    // Build filter criteria
    const whereClause: any = {};

    if (subject) {
      whereClause.document = {
        ...whereClause.document,
        subject,
      };
    }

    if (gradeLevel) {
      whereClause.document = {
        ...whereClause.document,
        gradeLevel,
      };
    }

    // Students can only see public documents
    if (userRole === "student") {
      whereClause.document = {
        ...whereClause.document,
        isPublic: true,
      };
    }

    // Retrieve all chunks with embeddings
    const chunks = await prisma.aIDocumentChunk.findMany({
      where: whereClause,
      include: {
        document: {
          select: {
            id: true,
            title: true,
            subject: true,
            gradeLevel: true,
            fileUrl: true,
          },
        },
      },
      take: 100, // Get more initially, then filter by similarity
    });

    // Calculate similarity scores
    const scoredChunks = chunks
      .map((chunk) => {
        if (!chunk.embedding) return null;

        const chunkEmbedding = JSON.parse(chunk.embedding);
        const score = cosineSimilarity(queryEmbedding, chunkEmbedding);

        return {
          id: chunk.id,
          content: chunk.content,
          score,
          metadata: {
            documentId: chunk.document.id,
            documentTitle: chunk.document.title,
            subject: chunk.document.subject,
            gradeLevel: chunk.document.gradeLevel,
            fileUrl: chunk.document.fileUrl,
            chunkIndex: chunk.chunkIndex,
            ...chunk.metadata,
          },
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    console.log(`Retrieved ${scoredChunks.length} documents for query: "${query}"`);

    return scoredChunks;
  } catch (error) {
    console.error("Error retrieving documents:", error);
    throw error;
  }
}

/**
 * Store document chunks with embeddings
 */
export async function storeDocumentChunks(
  documentId: string,
  chunks: Array<{ content: string; metadata?: any; chunkIndex: number }>
) {
  try {
    // Generate embeddings for all chunks
    const chunksWithEmbeddings = await Promise.all(
      chunks.map(async (chunk) => {
        const embedding = await generateEmbedding(chunk.content);
        return {
          documentId,
          content: chunk.content,
          embedding: JSON.stringify(embedding),
          chunkIndex: chunk.chunkIndex,
          metadata: chunk.metadata,
        };
      })
    );

    // Store in database
    await prisma.aIDocumentChunk.createMany({
      data: chunksWithEmbeddings,
    });

    console.log(`Stored ${chunks.length} chunks for document ${documentId}`);

    return { success: true, chunksStored: chunks.length };
  } catch (error) {
    console.error("Error storing document chunks:", error);
    throw error;
  }
}

/**
 * Delete all chunks for a document
 */
export async function deleteDocumentChunks(documentId: string) {
  try {
    await prisma.aIDocumentChunk.deleteMany({
      where: { documentId },
    });

    console.log(`Deleted chunks for document ${documentId}`);
    return { success: true };
  } catch (error) {
    console.error("Error deleting document chunks:", error);
    throw error;
  }
}

/**
 * Hybrid search: Combine vector similarity with keyword matching
 */
export async function hybridSearch(
  query: string,
  options: {
    subject?: string;
    gradeLevel?: number;
    userRole: "teacher" | "student";
    topK?: number;
    alpha?: number; // Weight for vector search (0-1), 1-alpha for keyword search
  }
) {
  const { alpha = 0.7, topK = 5 } = options;

  try {
    // Get vector search results
    const vectorResults = await retrieveDocuments(query, options);

    // Get keyword search results
    const keywords = query
      .toLowerCase()
      .split(" ")
      .filter((word) => word.length > 2);

    const whereClause: any = {
      OR: keywords.map((keyword) => ({
        content: {
          contains: keyword,
          mode: "insensitive",
        },
      })),
    };

    if (options.subject) {
      whereClause.document = { subject: options.subject };
    }

    if (options.userRole === "student") {
      whereClause.document = {
        ...whereClause.document,
        isPublic: true,
      };
    }

    const keywordResults = await prisma.aIDocumentChunk.findMany({
      where: whereClause,
      include: {
        document: {
          select: {
            id: true,
            title: true,
            subject: true,
            gradeLevel: true,
          },
        },
      },
      take: topK * 2,
    });

    // Combine and re-rank results
    const combinedResults = new Map();

    // Add vector results with weight
    vectorResults.forEach((result) => {
      combinedResults.set(result.id, {
        ...result,
        score: result.score * alpha,
      });
    });

    // Add keyword results with weight
    keywordResults.forEach((result) => {
      const existing = combinedResults.get(result.id);
      const keywordScore = (1 - alpha) * 0.5; // Base keyword score

      if (existing) {
        existing.score += keywordScore;
      } else {
        combinedResults.set(result.id, {
          id: result.id,
          content: result.content,
          score: keywordScore,
          metadata: {
            documentId: result.document.id,
            documentTitle: result.document.title,
            subject: result.document.subject,
            gradeLevel: result.document.gradeLevel,
          },
        });
      }
    });

    // Sort and return top K
    const finalResults = Array.from(combinedResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return finalResults;
  } catch (error) {
    console.error("Error in hybrid search:", error);
    return vectorResults; // Fallback to vector results
  }
}
