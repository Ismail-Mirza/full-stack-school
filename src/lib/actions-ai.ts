"use server";

/**
 * AI Playground Server Actions
 * Handles all AI-related operations: queries, document uploads, content generation, feedback
 */

import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import prisma from "./prisma";
import { executeRAGWorkflow } from "./ai/graphs/rag-workflow";
import { processDocument, deleteDocument, updateDocumentMetadata } from "./ai/utils/document-processing";
import { logAnalytics } from "./ai/utils/analytics";

type ActionResult = {
  success: boolean;
  error: boolean;
  message?: string;
  data?: any;
};

/**
 * Query the AI Playground
 */
export async function queryAIPlayground(
  query: string,
  options: {
    mode: "research" | "math_solver" | "physics_solver" | "chemistry_solver" | "quiz_creator" | "exam_creator";
    subject?: string;
    gradeLevel?: number;
    conversationId?: string;
    streaming?: boolean;
  }
): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    // Get user role from session
    const user = await prisma.student.findUnique({ where: { id: userId } })
      || await prisma.teacher.findUnique({ where: { id: userId } });

    if (!user) {
      return { success: false, error: true, message: "User not found" };
    }

    const userRole = "username" in user && user.username.includes("teacher") ? "teacher" : "student";

    // Create or get conversation
    let conversationId = options.conversationId;
    if (!conversationId) {
      const conversation = await prisma.aIConversation.create({
        data: {
          userId,
          userRole,
          title: query.slice(0, 50) + (query.length > 50 ? "..." : ""),
          mode: options.mode,
          subject: options.subject,
          gradeLevel: options.gradeLevel,
        },
      });
      conversationId = conversation.id;
    }

    // Execute RAG workflow
    const result = await executeRAGWorkflow(
      query,
      userId,
      userRole,
      options.mode,
      conversationId,
      {
        subject: options.subject,
        gradeLevel: options.gradeLevel,
      }
    );

    // Store message
    await prisma.aIMessage.create({
      data: {
        conversationId,
        role: "user",
        content: query,
      },
    });

    if (result.success && result.answer) {
      await prisma.aIMessage.create({
        data: {
          conversationId,
          role: "assistant",
          content: result.answer,
          confidence: result.confidence,
          retrievedDocs: result.documents || [],
          metadata: result.metadata,
        },
      });
    }

    return {
      success: result.success,
      error: !result.success,
      message: result.success ? "Answer generated successfully" : result.error,
      data: {
        answer: result.answer,
        confidence: result.confidence,
        sources: result.sources,
        conversationId,
        metadata: result.metadata,
      },
    };
  } catch (error: any) {
    console.error("Error in queryAIPlayground:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to process query",
    };
  }
}

/**
 * Upload and process document
 */
export async function uploadAIDocument(formData: FormData): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    // Check if user is teacher or admin
    const teacher = await prisma.teacher.findUnique({ where: { id: userId } });
    const admin = await prisma.admin.findUnique({ where: { id: userId } });

    if (!teacher && !admin) {
      return {
        success: false,
        error: true,
        message: "Only teachers and admins can upload documents"
      };
    }

    const file = formData.get("file") as File;
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const subject = formData.get("subject") as string;
    const gradeLevel = formData.get("gradeLevel") ? parseInt(formData.get("gradeLevel") as string) : undefined;
    const classId = formData.get("classId") ? parseInt(formData.get("classId") as string) : undefined;
    const subjectId = formData.get("subjectId") ? parseInt(formData.get("subjectId") as string) : undefined;
    const isPublic = formData.get("isPublic") === "true";

    if (!file || !title) {
      return {
        success: false,
        error: true,
        message: "File and title are required"
      };
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // For now, use a placeholder URL (in production, upload to Cloudinary first)
    const fileUrl = `https://placeholder.com/${file.name}`;

    // Process document
    const result = await processDocument(
      buffer,
      file.type,
      fileUrl,
      {
        title,
        description,
        subject,
        gradeLevel,
        classId,
        subjectId,
        uploadedBy: userId,
        uploadedByRole: teacher ? "teacher" : "admin",
        isPublic,
      }
    );

    revalidatePath("/teacher/playground/documents");
    revalidatePath("/admin/playground/documents");

    return {
      success: result.success,
      error: !result.success,
      message: "Document uploaded and processed successfully",
      data: result,
    };
  } catch (error: any) {
    console.error("Error uploading document:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to upload document",
    };
  }
}

/**
 * Delete document
 */
export async function deleteAIDocument(documentId: string): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    await deleteDocument(documentId, userId);

    revalidatePath("/teacher/playground/documents");
    revalidatePath("/admin/playground/documents");

    return {
      success: true,
      error: false,
      message: "Document deleted successfully",
    };
  } catch (error: any) {
    console.error("Error deleting document:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to delete document",
    };
  }
}

/**
 * Update document metadata
 */
export async function updateAIDocument(
  documentId: string,
  updates: {
    title?: string;
    description?: string;
    subject?: string;
    gradeLevel?: number;
    isPublic?: boolean;
  }
): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    const result = await updateDocumentMetadata(documentId, userId, updates);

    revalidatePath("/teacher/playground/documents");
    revalidatePath("/admin/playground/documents");

    return {
      success: result.success,
      error: !result.success,
      message: "Document updated successfully",
      data: result.document,
    };
  } catch (error: any) {
    console.error("Error updating document:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to update document",
    };
  }
}

/**
 * Generate quiz from topic
 */
export async function generateQuiz(
  topic: string,
  options: {
    subject?: string;
    gradeLevel?: number;
    difficulty?: "easy" | "medium" | "hard";
    questionCount?: number;
    questionTypes?: string[];
  }
): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    // Check if user is teacher
    const teacher = await prisma.teacher.findUnique({ where: { id: userId } });
    if (!teacher) {
      return {
        success: false,
        error: true,
        message: "Only teachers can generate quizzes"
      };
    }

    // Create conversation for tracking
    const conversation = await prisma.aIConversation.create({
      data: {
        userId,
        userRole: "teacher",
        title: `Quiz: ${topic}`,
        mode: "quiz_creator",
        subject: options.subject,
        gradeLevel: options.gradeLevel,
      },
    });

    // Build prompt for quiz generation
    const prompt = `Generate a quiz on the topic: "${topic}"

Requirements:
- Number of questions: ${options.questionCount || 10}
- Difficulty: ${options.difficulty || "medium"}
- Subject: ${options.subject || "general"}
- Grade Level: ${options.gradeLevel || "not specified"}
- Question types: ${options.questionTypes?.join(", ") || "multiple choice, short answer"}

Format the output as JSON with this structure:
{
  "title": "Quiz Title",
  "questions": [
    {
      "type": "multiple_choice|short_answer|true_false",
      "question": "Question text",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "Correct answer",
      "explanation": "Why this is correct",
      "points": 1
    }
  ],
  "totalPoints": 10
}`;

    // Execute RAG workflow with quiz_creator mode
    const result = await executeRAGWorkflow(
      prompt,
      userId,
      "teacher",
      "quiz_creator",
      conversation.id,
      {
        subject: options.subject,
        gradeLevel: options.gradeLevel,
      }
    );

    if (!result.success) {
      return {
        success: false,
        error: true,
        message: "Failed to generate quiz",
      };
    }

    // Parse quiz from answer
    let quizData;
    try {
      const jsonMatch = result.answer?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        quizData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Error parsing quiz JSON:", parseError);
      return {
        success: false,
        error: true,
        message: "Failed to parse quiz data",
      };
    }

    // Store generated quiz
    const generatedContent = await prisma.aIGeneratedContent.create({
      data: {
        conversationId: conversation.id,
        createdBy: userId,
        type: "quiz",
        title: quizData.title || `Quiz: ${topic}`,
        content: quizData,
        subject: options.subject,
        gradeLevel: options.gradeLevel,
        difficulty: options.difficulty || "medium",
        format: "json",
      },
    });

    return {
      success: true,
      error: false,
      message: "Quiz generated successfully",
      data: {
        quiz: quizData,
        contentId: generatedContent.id,
        conversationId: conversation.id,
      },
    };
  } catch (error: any) {
    console.error("Error generating quiz:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to generate quiz",
    };
  }
}

/**
 * Generate exam from topics
 */
export async function generateExam(
  topics: string[],
  options: {
    subject?: string;
    gradeLevel?: number;
    duration?: number;
    totalPoints?: number;
    sections?: string[];
  }
): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    // Check if user is teacher
    const teacher = await prisma.teacher.findUnique({ where: { id: userId } });
    if (!teacher) {
      return {
        success: false,
        error: true,
        message: "Only teachers can generate exams"
      };
    }

    // Create conversation
    const conversation = await prisma.aIConversation.create({
      data: {
        userId,
        userRole: "teacher",
        title: `Exam: ${topics.join(", ")}`,
        mode: "exam_creator",
        subject: options.subject,
        gradeLevel: options.gradeLevel,
      },
    });

    // Build prompt
    const prompt = `Generate a comprehensive exam covering these topics: ${topics.join(", ")}

Requirements:
- Subject: ${options.subject || "general"}
- Grade Level: ${options.gradeLevel || "not specified"}
- Duration: ${options.duration || 60} minutes
- Total Points: ${options.totalPoints || 100}
- Sections: ${options.sections?.join(", ") || "Multiple sections"}

Format as JSON:
{
  "title": "Exam Title",
  "duration": ${options.duration || 60},
  "totalPoints": ${options.totalPoints || 100},
  "sections": [
    {
      "title": "Section Name",
      "instructions": "Section instructions",
      "questions": [...],
      "points": 30
    }
  ],
  "answerKey": {...}
}`;

    // Execute RAG workflow
    const result = await executeRAGWorkflow(
      prompt,
      userId,
      "teacher",
      "exam_creator",
      conversation.id,
      {
        subject: options.subject,
        gradeLevel: options.gradeLevel,
      }
    );

    if (!result.success) {
      return {
        success: false,
        error: true,
        message: "Failed to generate exam",
      };
    }

    // Parse exam data
    let examData;
    try {
      const jsonMatch = result.answer?.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        examData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      return {
        success: false,
        error: true,
        message: "Failed to parse exam data",
      };
    }

    // Store generated exam
    const generatedContent = await prisma.aIGeneratedContent.create({
      data: {
        conversationId: conversation.id,
        createdBy: userId,
        type: "exam",
        title: examData.title || `Exam: ${topics.join(", ")}`,
        content: examData,
        subject: options.subject,
        gradeLevel: options.gradeLevel,
        format: "json",
      },
    });

    return {
      success: true,
      error: false,
      message: "Exam generated successfully",
      data: {
        exam: examData,
        contentId: generatedContent.id,
        conversationId: conversation.id,
      },
    };
  } catch (error: any) {
    console.error("Error generating exam:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to generate exam",
    };
  }
}

/**
 * Submit feedback for a message
 */
export async function submitAIFeedback(
  messageId: string,
  conversationId: string,
  feedback: {
    feedbackType: "thumbs_up" | "thumbs_down" | "correction" | "rating";
    rating?: number;
    comment?: string;
    correctedAnswer?: string;
  }
): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    await prisma.aIFeedback.create({
      data: {
        conversationId,
        messageId,
        userId,
        feedbackType: feedback.feedbackType,
        rating: feedback.rating,
        comment: feedback.comment,
        correctedAnswer: feedback.correctedAnswer,
      },
    });

    // Log feedback event
    await logAnalytics({
      userId,
      eventType: "feedback",
      metadata: {
        feedbackType: feedback.feedbackType,
        hasCorrection: !!feedback.correctedAnswer,
      },
    });

    return {
      success: true,
      error: false,
      message: "Feedback submitted successfully",
    };
  } catch (error: any) {
    console.error("Error submitting feedback:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to submit feedback",
    };
  }
}

/**
 * Get conversation history
 */
export async function getConversationHistory(
  limit: number = 20,
  offset: number = 0
): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    const conversations = await prisma.aIConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: { messages: true },
        },
      },
    });

    return {
      success: true,
      error: false,
      data: conversations,
    };
  } catch (error: any) {
    console.error("Error getting conversation history:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to get conversation history",
    };
  }
}

/**
 * Get conversation messages
 */
export async function getConversationMessages(
  conversationId: string
): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    // Verify ownership
    const conversation = await prisma.aIConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || conversation.userId !== userId) {
      return {
        success: false,
        error: true,
        message: "Conversation not found or unauthorized"
      };
    }

    const messages = await prisma.aIMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      include: {
        feedback: true,
      },
    });

    return {
      success: true,
      error: false,
      data: {
        conversation,
        messages,
      },
    };
  } catch (error: any) {
    console.error("Error getting conversation messages:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to get conversation messages",
    };
  }
}

/**
 * Delete conversation
 */
export async function deleteConversation(
  conversationId: string
): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    // Verify ownership
    const conversation = await prisma.aIConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation || conversation.userId !== userId) {
      return {
        success: false,
        error: true,
        message: "Conversation not found or unauthorized"
      };
    }

    await prisma.aIConversation.delete({
      where: { id: conversationId },
    });

    revalidatePath("/teacher/playground");
    revalidatePath("/student/playground");

    return {
      success: true,
      error: false,
      message: "Conversation deleted successfully",
    };
  } catch (error: any) {
    console.error("Error deleting conversation:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to delete conversation",
    };
  }
}

/**
 * Get user's documents
 */
export async function getUserAIDocuments(
  filters?: {
    subject?: string;
    gradeLevel?: number;
    classId?: number;
  }
): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    // Determine user role
    const teacher = await prisma.teacher.findUnique({ where: { id: userId } });
    const student = await prisma.student.findUnique({ where: { id: userId } });
    const admin = await prisma.admin.findUnique({ where: { id: userId } });

    let userRole: "teacher" | "student" | "admin";
    if (teacher) userRole = "teacher";
    else if (admin) userRole = "admin";
    else if (student) userRole = "student";
    else {
      return { success: false, error: true, message: "User not found" };
    }

    const whereClause: any = {};

    if (userRole === "teacher" || userRole === "admin") {
      whereClause.uploadedBy = userId;
    } else {
      whereClause.isPublic = true;
    }

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

    return {
      success: true,
      error: false,
      data: documents,
    };
  } catch (error: any) {
    console.error("Error getting user documents:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to get user documents",
    };
  }
}

/**
 * Get generated content
 */
export async function getGeneratedContent(
  type?: "quiz" | "exam" | "slide" | "poster"
): Promise<ActionResult> {
  try {
    const { userId } = await auth();

    if (!userId) {
      return { success: false, error: true, message: "Unauthorized" };
    }

    const whereClause: any = { createdBy: userId };
    if (type) whereClause.type = type;

    const content = await prisma.aIGeneratedContent.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      include: {
        conversation: {
          select: {
            title: true,
            mode: true,
            subject: true,
          },
        },
      },
    });

    return {
      success: true,
      error: false,
      data: content,
    };
  } catch (error: any) {
    console.error("Error getting generated content:", error);
    return {
      success: false,
      error: true,
      message: error.message || "Failed to get generated content",
    };
  }
}
