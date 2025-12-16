/**
 * LangGraph RAG Workflow
 * Self-learning Retrieval Augmented Generation system
 */

import { StateGraph, END, START } from "@langchain/langgraph";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { RunnableSequence } from "@langchain/core/runnables";

// Import our custom utilities
import { retrieveDocuments } from "../utils/vector-store";
import { refineQuery } from "../utils/query-refinement";
import { generateAnswer } from "../utils/answer-generation";
import { evaluateAnswer } from "../utils/self-evaluation";
import { logAnalytics } from "../utils/analytics";

/**
 * State interface for the RAG workflow
 */
export interface RAGState {
  // User input
  originalQuery: string;
  refinedQuery?: string;
  userId: string;
  userRole: "teacher" | "student";
  mode: "research" | "math_solver" | "physics_solver" | "chemistry_solver" | "quiz_creator" | "exam_creator";
  subject?: string;
  gradeLevel?: number;
  conversationId: string;

  // Retrieval
  retrievedDocuments: Array<{
    id: string;
    content: string;
    metadata: any;
    score: number;
  }>;
  relevanceScores?: number[];

  // Generation
  generatedAnswer?: string;
  confidence?: number;
  sources?: string[];

  // Self-learning
  needsRefinement: boolean;
  refinementAttempts: number;
  evaluationScore?: number;
  feedback?: string;

  // Messages
  messages: BaseMessage[];

  // Metadata
  startTime: number;
  tokenUsage: number;
  error?: string;
}

/**
 * Initial state
 */
export const createInitialState = (
  query: string,
  userId: string,
  userRole: "teacher" | "student",
  mode: string,
  conversationId: string,
  options?: { subject?: string; gradeLevel?: number }
): RAGState => ({
  originalQuery: query,
  userId,
  userRole,
  mode: mode as any,
  subject: options?.subject,
  gradeLevel: options?.gradeLevel,
  conversationId,
  retrievedDocuments: [],
  needsRefinement: false,
  refinementAttempts: 0,
  messages: [new HumanMessage(query)],
  startTime: Date.now(),
  tokenUsage: 0,
});

/**
 * Node: Query Refinement
 * Refines user query for better retrieval using historical data
 */
async function queryRefinementNode(state: RAGState): Promise<Partial<RAGState>> {
  console.log("🔄 Query Refinement Node");

  try {
    // Use historical data to refine query
    const refinedQuery = await refineQuery(
      state.originalQuery,
      state.mode,
      state.subject,
      state.refinementAttempts
    );

    return {
      refinedQuery,
      refinementAttempts: state.refinementAttempts + 1,
      messages: [
        ...state.messages,
        new SystemMessage(`Query refined: ${refinedQuery}`),
      ],
    };
  } catch (error) {
    console.error("Query refinement error:", error);
    return {
      refinedQuery: state.originalQuery,
      refinementAttempts: state.refinementAttempts + 1,
    };
  }
}

/**
 * Node: Document Retrieval
 * Retrieves relevant documents from vector store
 */
async function documentRetrievalNode(state: RAGState): Promise<Partial<RAGState>> {
  console.log("📚 Document Retrieval Node");

  const startTime = Date.now();

  try {
    const queryToUse = state.refinedQuery || state.originalQuery;

    // Retrieve documents using vector similarity search
    const retrievedDocuments = await retrieveDocuments(queryToUse, {
      subject: state.subject,
      gradeLevel: state.gradeLevel,
      userRole: state.userRole,
      topK: 5,
    });

    // Calculate relevance scores
    const relevanceScores = retrievedDocuments.map((doc) => doc.score);
    const avgRelevance = relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length;

    // Log retrieval analytics
    await logAnalytics({
      userId: state.userId,
      eventType: "retrieval",
      queryText: queryToUse,
      documentsRetrieved: retrievedDocuments.length,
      responseTime: Date.now() - startTime,
      metadata: { relevanceScores, avgRelevance },
    });

    return {
      retrievedDocuments,
      relevanceScores,
      messages: [
        ...state.messages,
        new SystemMessage(
          `Retrieved ${retrievedDocuments.length} documents (avg relevance: ${avgRelevance.toFixed(2)})`
        ),
      ],
    };
  } catch (error: any) {
    console.error("Document retrieval error:", error);
    return {
      retrievedDocuments: [],
      error: error.message,
    };
  }
}

/**
 * Node: Answer Generation
 * Generates answer using retrieved documents and LLM
 */
async function answerGenerationNode(state: RAGState): Promise<Partial<RAGState>> {
  console.log("🤖 Answer Generation Node");

  const startTime = Date.now();

  try {
    // Generate answer using RAG
    const result = await generateAnswer(
      state.refinedQuery || state.originalQuery,
      state.retrievedDocuments,
      state.mode,
      state.messages
    );

    // Log generation analytics
    await logAnalytics({
      userId: state.userId,
      eventType: "generation",
      queryText: state.refinedQuery || state.originalQuery,
      responseTime: Date.now() - startTime,
      tokenUsage: result.tokenUsage,
      metadata: { confidence: result.confidence, sources: result.sources },
    });

    return {
      generatedAnswer: result.answer,
      confidence: result.confidence,
      sources: result.sources,
      tokenUsage: state.tokenUsage + result.tokenUsage,
      messages: [
        ...state.messages,
        new AIMessage(result.answer),
      ],
    };
  } catch (error: any) {
    console.error("Answer generation error:", error);
    return {
      error: error.message,
      generatedAnswer: "I apologize, but I encountered an error generating an answer. Please try again.",
    };
  }
}

/**
 * Node: Self-Evaluation
 * Evaluates the quality of generated answer
 */
async function selfEvaluationNode(state: RAGState): Promise<Partial<RAGState>> {
  console.log("✅ Self-Evaluation Node");

  try {
    if (!state.generatedAnswer) {
      return { evaluationScore: 0, needsRefinement: true };
    }

    // Evaluate answer quality
    const evaluation = await evaluateAnswer(
      state.originalQuery,
      state.generatedAnswer,
      state.retrievedDocuments,
      state.confidence || 0
    );

    const needsRefinement =
      evaluation.score < 0.7 &&
      state.refinementAttempts < 3 &&
      state.retrievedDocuments.length > 0;

    return {
      evaluationScore: evaluation.score,
      needsRefinement,
      feedback: evaluation.feedback,
      messages: [
        ...state.messages,
        new SystemMessage(
          `Self-evaluation score: ${evaluation.score.toFixed(2)} ${needsRefinement ? "(refinement needed)" : ""}`
        ),
      ],
    };
  } catch (error: any) {
    console.error("Self-evaluation error:", error);
    return {
      evaluationScore: 0.5,
      needsRefinement: false,
    };
  }
}

/**
 * Conditional edge: Decide if refinement is needed
 */
function shouldRefine(state: RAGState): string {
  if (state.needsRefinement && state.refinementAttempts < 3) {
    console.log("🔄 Refinement needed - looping back");
    return "refine";
  }
  console.log("✅ Answer is satisfactory - ending");
  return "end";
}

/**
 * Build the RAG workflow graph
 */
export function buildRAGWorkflow() {
  // Create the state graph
  const workflow = new StateGraph<RAGState>({
    channels: {
      originalQuery: null,
      refinedQuery: null,
      userId: null,
      userRole: null,
      mode: null,
      subject: null,
      gradeLevel: null,
      conversationId: null,
      retrievedDocuments: null,
      relevanceScores: null,
      generatedAnswer: null,
      confidence: null,
      sources: null,
      needsRefinement: null,
      refinementAttempts: null,
      evaluationScore: null,
      feedback: null,
      messages: null,
      startTime: null,
      tokenUsage: null,
      error: null,
    },
  });

  // Add nodes
  workflow.addNode("queryRefinement", queryRefinementNode);
  workflow.addNode("documentRetrieval", documentRetrievalNode);
  workflow.addNode("answerGeneration", answerGenerationNode);
  workflow.addNode("selfEvaluation", selfEvaluationNode);

  // Add edges
  workflow.addEdge(START, "queryRefinement");
  workflow.addEdge("queryRefinement", "documentRetrieval");
  workflow.addEdge("documentRetrieval", "answerGeneration");
  workflow.addEdge("answerGeneration", "selfEvaluation");

  // Add conditional edge for self-learning loop
  workflow.addConditionalEdges("selfEvaluation", shouldRefine, {
    refine: "queryRefinement",
    end: END,
  });

  // Compile the graph
  return workflow.compile();
}

/**
 * Execute the RAG workflow
 */
export async function executeRAGWorkflow(
  query: string,
  userId: string,
  userRole: "teacher" | "student",
  mode: string,
  conversationId: string,
  options?: { subject?: string; gradeLevel?: number }
) {
  const startTime = Date.now();

  try {
    // Create initial state
    const initialState = createInitialState(
      query,
      userId,
      userRole,
      mode,
      conversationId,
      options
    );

    // Build and execute workflow
    const workflow = buildRAGWorkflow();
    const result = await workflow.invoke(initialState);

    // Log final analytics
    await logAnalytics({
      userId,
      eventType: "workflow_complete",
      queryText: query,
      responseTime: Date.now() - startTime,
      tokenUsage: result.tokenUsage,
      success: !result.error,
      errorMessage: result.error,
      metadata: {
        refinementAttempts: result.refinementAttempts,
        evaluationScore: result.evaluationScore,
        documentsUsed: result.retrievedDocuments.length,
      },
    });

    return {
      success: !result.error,
      answer: result.generatedAnswer,
      confidence: result.confidence,
      sources: result.sources,
      documents: result.retrievedDocuments,
      metadata: {
        refinementAttempts: result.refinementAttempts,
        evaluationScore: result.evaluationScore,
        tokenUsage: result.tokenUsage,
        responseTime: Date.now() - startTime,
      },
    };
  } catch (error: any) {
    console.error("RAG workflow error:", error);

    await logAnalytics({
      userId,
      eventType: "workflow_error",
      queryText: query,
      responseTime: Date.now() - startTime,
      success: false,
      errorMessage: error.message,
    });

    return {
      success: false,
      error: error.message,
      answer: "I apologize, but I encountered an error processing your request. Please try again.",
    };
  }
}
