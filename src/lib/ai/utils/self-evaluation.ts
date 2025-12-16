/**
 * Self-Evaluation Utility
 * Evaluates answer quality for self-learning
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

const evaluationLLM = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Evaluate answer quality
 */
export async function evaluateAnswer(
  query: string,
  generatedAnswer: string,
  retrievedDocuments: Array<{
    content: string;
    metadata: any;
    score: number;
  }>,
  confidence: number
): Promise<{
  score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
}> {
  try {
    // Prepare context
    const context = retrievedDocuments
      .slice(0, 3) // Use top 3 documents
      .map((doc) => doc.content)
      .join("\n\n");

    // Evaluation prompt
    const evaluationPrompt = PromptTemplate.fromTemplate(`
You are an expert educational content evaluator. Assess the quality of the AI-generated answer.

QUESTION:
{query}

RETRIEVED CONTEXT:
{context}

GENERATED ANSWER:
{generatedAnswer}

MODEL CONFIDENCE: {confidence}

Evaluate the answer on these criteria:
1. **Accuracy**: Is the answer factually correct based on the context?
2. **Completeness**: Does it fully address the question?
3. **Clarity**: Is it clear and well-explained?
4. **Educational Value**: Does it help the student learn?
5. **Relevance**: Does it stay on topic?
6. **Source Usage**: Does it properly utilize the retrieved context?

Provide your evaluation in JSON format:
{{
  "score": <0.0-1.0>,
  "feedback": "<overall feedback>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<improvement 1>", "<improvement 2>"],
  "reasoning": "<detailed reasoning>"
}}

Evaluation:`);

    const chain = evaluationPrompt.pipe(evaluationLLM).pipe(new StringOutputParser());

    const evaluationResult = await chain.invoke({
      query,
      context: context || "No context available",
      generatedAnswer,
      confidence: confidence.toFixed(2),
    });

    // Parse JSON response
    const jsonMatch = evaluationResult.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse evaluation response");
    }

    const evaluation = JSON.parse(jsonMatch[0]);

    // Adjust score based on document relevance
    const avgDocumentScore =
      retrievedDocuments.reduce((sum, doc) => sum + doc.score, 0) /
      (retrievedDocuments.length || 1);

    // Penalize if documents have low relevance
    let adjustedScore = evaluation.score;
    if (avgDocumentScore < 0.5) {
      adjustedScore *= 0.8;
    }

    // Penalize if confidence is low
    if (confidence < 0.5) {
      adjustedScore *= 0.9;
    }

    return {
      score: Math.max(0, Math.min(1, adjustedScore)), // Clamp between 0-1
      feedback: evaluation.feedback,
      strengths: evaluation.strengths || [],
      improvements: evaluation.improvements || [],
    };
  } catch (error) {
    console.error("Error in self-evaluation:", error);

    // Fallback heuristic evaluation
    return heuristicEvaluation(query, generatedAnswer, retrievedDocuments, confidence);
  }
}

/**
 * Heuristic evaluation (fallback when LLM evaluation fails)
 */
function heuristicEvaluation(
  query: string,
  generatedAnswer: string,
  retrievedDocuments: Array<any>,
  confidence: number
): {
  score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
} {
  let score = 0.5; // Start with neutral score
  const strengths: string[] = [];
  const improvements: string[] = [];

  // Check answer length
  const answerLength = generatedAnswer.split(/\s+/).length;
  if (answerLength > 30 && answerLength < 500) {
    score += 0.1;
    strengths.push("Answer has appropriate length");
  } else if (answerLength < 30) {
    score -= 0.1;
    improvements.push("Answer may be too brief");
  } else {
    improvements.push("Answer may be too verbose");
  }

  // Check if question keywords are addressed
  const queryKeywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3);
  const answerLower = generatedAnswer.toLowerCase();
  const keywordsAddressed = queryKeywords.filter((kw) => answerLower.includes(kw)).length;
  const keywordCoverage = keywordsAddressed / (queryKeywords.length || 1);

  if (keywordCoverage > 0.6) {
    score += 0.15;
    strengths.push("Answer addresses key concepts from the question");
  } else {
    score -= 0.1;
    improvements.push("Answer may not fully address all aspects of the question");
  }

  // Check document usage
  if (retrievedDocuments.length > 0) {
    const avgRelevance =
      retrievedDocuments.reduce((sum, doc) => sum + doc.score, 0) / retrievedDocuments.length;

    if (avgRelevance > 0.7) {
      score += 0.15;
      strengths.push("High-quality relevant documents were used");
    } else if (avgRelevance < 0.4) {
      score -= 0.15;
      improvements.push("Retrieved documents may not be highly relevant");
    }
  } else {
    score -= 0.2;
    improvements.push("No context documents were used");
  }

  // Factor in confidence
  score = score * 0.7 + confidence * 0.3;

  // Clamp score
  score = Math.max(0, Math.min(1, score));

  const feedback =
    score > 0.7
      ? "Answer appears to be of good quality"
      : score > 0.5
      ? "Answer is acceptable but could be improved"
      : "Answer may need significant improvement";

  return {
    score,
    feedback,
    strengths,
    improvements,
  };
}

/**
 * Evaluate specific aspects of the answer
 */
export async function evaluateAspect(
  aspect: "accuracy" | "clarity" | "completeness" | "educational_value",
  query: string,
  answer: string,
  context: string
): Promise<number> {
  try {
    const aspectPrompts = {
      accuracy: "How factually accurate is this answer based on the context? (0.0-1.0)",
      clarity: "How clear and understandable is this answer? (0.0-1.0)",
      completeness: "How completely does this answer address the question? (0.0-1.0)",
      educational_value: "How educationally valuable is this answer for learning? (0.0-1.0)",
    };

    const prompt = PromptTemplate.fromTemplate(`
Question: {query}
Context: {context}
Answer: {answer}

{aspectQuestion}

Respond with only a number between 0.0 and 1.0:`);

    const chain = prompt.pipe(evaluationLLM).pipe(new StringOutputParser());

    const result = await chain.invoke({
      query,
      context,
      answer,
      aspectQuestion: aspectPrompts[aspect],
    });

    const score = parseFloat(result.trim());
    return isNaN(score) ? 0.5 : Math.max(0, Math.min(1, score));
  } catch (error) {
    console.error(`Error evaluating aspect ${aspect}:`, error);
    return 0.5;
  }
}

/**
 * Check for hallucinations (answer claims not supported by context)
 */
export async function detectHallucinations(
  answer: string,
  retrievedDocuments: Array<{
    content: string;
    metadata: any;
  }>
): Promise<{
  hasHallucination: boolean;
  confidence: number;
  details: string;
}> {
  try {
    if (retrievedDocuments.length === 0) {
      return {
        hasHallucination: false,
        confidence: 0,
        details: "No context to verify against",
      };
    }

    const context = retrievedDocuments.map((doc) => doc.content).join("\n\n");

    const hallucinationPrompt = PromptTemplate.fromTemplate(`
You are a fact-checker. Determine if the answer contains information not supported by the context.

CONTEXT:
{context}

ANSWER TO CHECK:
{answer}

Does the answer contain claims, facts, or details that are NOT found in or reasonably inferred from the context?

Respond in JSON format:
{{
  "hasHallucination": <true|false>,
  "confidence": <0.0-1.0>,
  "details": "<explanation>"
}}

Analysis:`);

    const chain = hallucinationPrompt.pipe(evaluationLLM).pipe(new StringOutputParser());

    const result = await chain.invoke({
      context,
      answer,
    });

    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse hallucination detection response");
    }

    const detection = JSON.parse(jsonMatch[0]);

    return {
      hasHallucination: detection.hasHallucination || false,
      confidence: detection.confidence || 0.5,
      details: detection.details || "",
    };
  } catch (error) {
    console.error("Error detecting hallucinations:", error);
    return {
      hasHallucination: false,
      confidence: 0,
      details: "Error in hallucination detection",
    };
  }
}

/**
 * Compare multiple answers and select the best one
 */
export async function selectBestAnswer(
  query: string,
  answers: Array<{
    answer: string;
    confidence: number;
    sources: string[];
  }>,
  context: string
): Promise<number> {
  try {
    const answersList = answers
      .map(
        (ans, idx) =>
          `Answer ${idx + 1}:\n${ans.answer}\n(Confidence: ${ans.confidence}, Sources: ${ans.sources.length})`
      )
      .join("\n\n");

    const selectionPrompt = PromptTemplate.fromTemplate(`
You are an expert evaluator selecting the best answer to a student's question.

QUESTION:
{query}

CONTEXT:
{context}

CANDIDATE ANSWERS:
{answersList}

Which answer is the best? Consider accuracy, completeness, clarity, and educational value.

Respond with only the number of the best answer (1, 2, 3, etc.):`);

    const chain = selectionPrompt.pipe(evaluationLLM).pipe(new StringOutputParser());

    const result = await chain.invoke({
      query,
      context,
      answersList,
    });

    const selectedIndex = parseInt(result.trim()) - 1;

    if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= answers.length) {
      // Default to highest confidence if parsing fails
      return answers.reduce(
        (maxIdx, ans, idx, arr) => (ans.confidence > arr[maxIdx].confidence ? idx : maxIdx),
        0
      );
    }

    return selectedIndex;
  } catch (error) {
    console.error("Error selecting best answer:", error);
    // Default to highest confidence
    return answers.reduce(
      (maxIdx, ans, idx, arr) => (ans.confidence > arr[maxIdx].confidence ? idx : maxIdx),
      0
    );
  }
}
