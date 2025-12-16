/**
 * Answer Generation Utility
 * Generate answers using RAG with LLM
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { BaseMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";

const llm = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

const llmMath = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.2, // Lower temperature for mathematical accuracy
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Mode-specific system prompts
 */
const SYSTEM_PROMPTS = {
  research: `You are an educational research assistant helping students and teachers find accurate information.
Use the provided context to answer questions comprehensively.
Always cite sources and provide clear, educational explanations.
If the context doesn't contain enough information, acknowledge this and provide general guidance.`,

  math_solver: `You are an expert mathematics tutor.
Provide step-by-step solutions to mathematical problems.
Show all work and explain each step clearly.
Use proper mathematical notation.
Include final answers clearly boxed or highlighted.
Verify your calculations.`,

  physics_solver: `You are an expert physics tutor.
Provide detailed solutions to physics problems.
Show all steps including:
1. Given information and what we need to find
2. Relevant formulas and principles
3. Step-by-step calculations with units
4. Final answer with correct units
Explain the physical concepts involved.`,

  chemistry_solver: `You are an expert chemistry tutor.
Provide detailed solutions to chemistry problems.
Include:
1. Relevant chemical equations
2. Step-by-step calculations
3. Proper chemical notation
4. Units and significant figures
5. Conceptual explanations
Show balancing of equations where applicable.`,

  quiz_creator: `You are an educational assessment specialist.
Create high-quality quiz questions based on the provided context.
Questions should be:
1. Clear and unambiguous
2. Appropriate for the grade level
3. Diverse in type (multiple choice, short answer, etc.)
4. Testing understanding, not just memorization
5. Include correct answers and explanations`,

  exam_creator: `You are an expert exam designer.
Create comprehensive exams based on the provided context.
Include:
1. Mix of question types and difficulties
2. Questions covering different aspects of the topic
3. Clear instructions
4. Point values for each question
5. Answer key with explanations
6. Time recommendations`,
};

/**
 * Generate answer using RAG
 */
export async function generateAnswer(
  query: string,
  retrievedDocuments: Array<{
    content: string;
    metadata: any;
    score: number;
  }>,
  mode: string,
  conversationHistory: BaseMessage[] = []
) {
  const startTime = Date.now();

  try {
    // Select appropriate LLM based on mode
    const selectedLLM = ["math_solver", "physics_solver", "chemistry_solver"].includes(mode)
      ? llmMath
      : llm;

    // Get system prompt
    const systemPrompt = SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.research;

    // Prepare context from retrieved documents
    const context = retrievedDocuments
      .map((doc, idx) => {
        const source = doc.metadata.documentTitle || "Unknown source";
        return `[Document ${idx + 1}] (Source: ${source}, Relevance: ${doc.score.toFixed(2)})\n${doc.content}`;
      })
      .join("\n\n---\n\n");

    // Build conversation context
    const recentMessages = conversationHistory.slice(-6); // Last 3 exchanges
    const conversationContext = recentMessages
      .map((msg) => {
        const role = msg._getType() === "human" ? "Student" : "Assistant";
        return `${role}: ${msg.content}`;
      })
      .join("\n");

    // Create prompt template
    const promptTemplate = PromptTemplate.fromTemplate(`
${systemPrompt}

CONVERSATION HISTORY:
{conversationContext}

CONTEXT FROM KNOWLEDGE BASE:
{context}

CURRENT QUESTION:
{query}

{modeSpecificInstructions}

ANSWER:`);

    // Mode-specific instructions
    const modeInstructions: Record<string, string> = {
      math_solver: `Provide a complete step-by-step solution. Show all mathematical work.`,
      physics_solver: `Provide a detailed physics solution with proper units and explanations.`,
      chemistry_solver: `Provide a detailed chemistry solution with equations and calculations.`,
      quiz_creator: `Generate 5-10 quiz questions in JSON format with the structure:
{
  "questions": [
    {
      "type": "multiple_choice|short_answer|true_false",
      "question": "...",
      "options": ["A", "B", "C", "D"],
      "correct_answer": "...",
      "explanation": "..."
    }
  ]
}`,
      exam_creator: `Generate a comprehensive exam in JSON format with:
{
  "title": "...",
  "duration": "... minutes",
  "totalPoints": ...,
  "sections": [
    {
      "title": "...",
      "questions": [...],
      "points": ...
    }
  ]
}`,
    };

    const modeSpecificInstructions =
      modeInstructions[mode] ||
      "Provide a comprehensive, educational answer based on the context.";

    // Generate answer
    const chain = promptTemplate.pipe(selectedLLM).pipe(new StringOutputParser());

    const answer = await chain.invoke({
      conversationContext: conversationContext || "No previous conversation",
      context: context || "No specific context available from knowledge base",
      query,
      modeSpecificInstructions,
    });

    // Extract sources
    const sources = retrievedDocuments
      .filter((doc) => doc.score > 0.5)
      .map((doc) => doc.metadata.documentTitle || "Unknown")
      .filter((source, idx, self) => self.indexOf(source) === idx) // Unique sources
      .slice(0, 5);

    // Calculate confidence based on retrieval quality
    const avgRelevance =
      retrievedDocuments.reduce((sum, doc) => sum + doc.score, 0) /
      (retrievedDocuments.length || 1);
    const confidence = Math.min(avgRelevance * 1.2, 1.0); // Scale up slightly, cap at 1.0

    const responseTime = Date.now() - startTime;

    return {
      answer: answer.trim(),
      confidence,
      sources,
      tokenUsage: estimateTokens(answer), // Rough estimate
      responseTime,
      metadata: {
        documentsUsed: retrievedDocuments.length,
        avgRelevance,
      },
    };
  } catch (error: any) {
    console.error("Error generating answer:", error);
    throw new Error(`Answer generation failed: ${error.message}`);
  }
}

/**
 * Generate streaming answer (for real-time UI updates)
 */
export async function generateAnswerStream(
  query: string,
  retrievedDocuments: Array<{
    content: string;
    metadata: any;
    score: number;
  }>,
  mode: string,
  onChunk: (chunk: string) => void
) {
  try {
    const systemPrompt = SYSTEM_PROMPTS[mode as keyof typeof SYSTEM_PROMPTS] || SYSTEM_PROMPTS.research;

    const context = retrievedDocuments
      .map((doc, idx) => `[Document ${idx + 1}]\n${doc.content}`)
      .join("\n\n---\n\n");

    const selectedLLM = ["math_solver", "physics_solver", "chemistry_solver"].includes(mode)
      ? llmMath
      : llm;

    const prompt = `${systemPrompt}

CONTEXT:
${context}

QUESTION:
${query}

ANSWER:`;

    const stream = await selectedLLM.stream(prompt);

    let fullAnswer = "";

    for await (const chunk of stream) {
      const content = chunk.content.toString();
      fullAnswer += content;
      onChunk(content);
    }

    // Extract sources
    const sources = retrievedDocuments
      .filter((doc) => doc.score > 0.5)
      .map((doc) => doc.metadata.documentTitle || "Unknown")
      .filter((source, idx, self) => self.indexOf(source) === idx)
      .slice(0, 5);

    const avgRelevance =
      retrievedDocuments.reduce((sum, doc) => sum + doc.score, 0) /
      (retrievedDocuments.length || 1);

    return {
      answer: fullAnswer,
      confidence: Math.min(avgRelevance * 1.2, 1.0),
      sources,
      tokenUsage: estimateTokens(fullAnswer),
    };
  } catch (error: any) {
    console.error("Error in streaming generation:", error);
    throw error;
  }
}

/**
 * Generate subject-specific hints
 */
export async function generateHint(
  query: string,
  subject: string,
  difficulty: "easy" | "medium" | "hard" = "medium"
) {
  try {
    const hintPrompt = PromptTemplate.fromTemplate(`
You are a tutor providing helpful hints without giving away the full solution.

Subject: {subject}
Difficulty: {difficulty}
Student Question: {query}

Provide a helpful hint that:
1. Guides the student's thinking
2. Doesn't give away the answer
3. Points to relevant concepts or formulas
4. Encourages problem-solving

Hint:`);

    const chain = hintPrompt.pipe(llm).pipe(new StringOutputParser());

    const hint = await chain.invoke({
      subject,
      difficulty,
      query,
    });

    return hint.trim();
  } catch (error) {
    console.error("Error generating hint:", error);
    return "Try breaking down the problem into smaller steps and identify what you know and what you need to find.";
  }
}

/**
 * Estimate token count (rough approximation)
 */
function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Format mathematical notation for display
 */
export function formatMathNotation(text: string): string {
  // Convert common math patterns to LaTeX
  let formatted = text;

  // Fractions: a/b -> \frac{a}{b}
  formatted = formatted.replace(/(\d+)\/(\d+)/g, "\\frac{$1}{$2}");

  // Exponents: x^2 -> x^{2}
  formatted = formatted.replace(/\^(\d+)/g, "^{$1}");

  // Square roots: sqrt(x) -> \sqrt{x}
  formatted = formatted.replace(/sqrt\(([^)]+)\)/g, "\\sqrt{$1}");

  return formatted;
}
