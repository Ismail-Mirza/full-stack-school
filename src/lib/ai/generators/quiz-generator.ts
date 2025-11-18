/**
 * Quiz Generator
 * Generates structured quizzes from topics using RAG
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { retrieveDocuments } from "../utils/vector-store";

const llm = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

export interface QuizQuestion {
  type: "multiple_choice" | "short_answer" | "true_false" | "fill_blank";
  question: string;
  options?: string[];
  correct_answer: string;
  explanation: string;
  points: number;
  difficulty?: "easy" | "medium" | "hard";
  topic?: string;
}

export interface Quiz {
  title: string;
  description?: string;
  subject?: string;
  gradeLevel?: number;
  duration?: number;
  totalPoints: number;
  questions: QuizQuestion[];
  metadata?: any;
}

export interface QuizOptions {
  subject?: string;
  gradeLevel?: number;
  difficulty?: "easy" | "medium" | "hard";
  questionCount?: number;
  questionTypes?: string[];
  includeExplanations?: boolean;
  pointsPerQuestion?: number;
}

/**
 * Generate quiz from topic
 */
export async function generateQuiz(
  topic: string,
  options: QuizOptions = {}
): Promise<Quiz> {
  const {
    subject,
    gradeLevel,
    difficulty = "medium",
    questionCount = 10,
    questionTypes = ["multiple_choice", "short_answer"],
    includeExplanations = true,
    pointsPerQuestion = 1,
  } = options;

  try {
    // Retrieve relevant documents
    const documents = await retrieveDocuments(topic, {
      subject,
      gradeLevel,
      userRole: "teacher",
      topK: 5,
    });

    // Prepare context
    const context = documents
      .map((doc) => `[${doc.metadata.documentTitle}]\n${doc.content}`)
      .join("\n\n---\n\n");

    // Create prompt
    const quizPrompt = PromptTemplate.fromTemplate(`
You are an expert educational assessment designer creating a quiz.

TOPIC: {topic}
SUBJECT: {subject}
GRADE LEVEL: {gradeLevel}
DIFFICULTY: {difficulty}
NUMBER OF QUESTIONS: {questionCount}
QUESTION TYPES: {questionTypes}

CONTEXT FROM EDUCATIONAL MATERIALS:
{context}

Create a well-structured quiz based on the topic and context provided.

Requirements:
1. Questions should be clear and unambiguous
2. Multiple choice questions should have 4 options (A, B, C, D)
3. Include detailed explanations for each answer
4. Vary the difficulty within the specified level
5. Cover different aspects of the topic
6. Use age-appropriate language for grade level {gradeLevel}

Format your response as a JSON object with this EXACT structure:
{{
  "title": "Quiz title",
  "description": "Brief description",
  "duration": 30,
  "totalPoints": {totalPoints},
  "questions": [
    {{
      "type": "multiple_choice",
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_answer": "Option A",
      "explanation": "Explanation why this is correct",
      "points": {pointsPerQuestion},
      "difficulty": "{difficulty}",
      "topic": "{topic}"
    }},
    {{
      "type": "short_answer",
      "question": "Question text here?",
      "correct_answer": "Expected answer",
      "explanation": "Explanation",
      "points": {pointsPerQuestion},
      "difficulty": "{difficulty}",
      "topic": "{topic}"
    }}
  ]
}}

Generate the quiz now:`);

    const chain = quizPrompt.pipe(llm).pipe(new StringOutputParser());

    const response = await chain.invoke({
      topic,
      subject: subject || "General",
      gradeLevel: gradeLevel || "Not specified",
      difficulty,
      questionCount,
      questionTypes: questionTypes.join(", "),
      context: context || "No specific context available - use general knowledge",
      totalPoints: questionCount * pointsPerQuestion,
      pointsPerQuestion,
    });

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse quiz JSON from response");
    }

    const quiz: Quiz = JSON.parse(jsonMatch[0]);

    // Validate quiz structure
    if (!quiz.questions || quiz.questions.length === 0) {
      throw new Error("Generated quiz has no questions");
    }

    return quiz;
  } catch (error: any) {
    console.error("Error generating quiz:", error);
    throw new Error(`Quiz generation failed: ${error.message}`);
  }
}

/**
 * Generate quiz questions by difficulty distribution
 */
export async function generateBalancedQuiz(
  topic: string,
  options: QuizOptions & {
    distribution?: { easy: number; medium: number; hard: number };
  }
): Promise<Quiz> {
  const distribution = options.distribution || { easy: 3, medium: 5, hard: 2 };

  const easyQuestions = await generateQuiz(topic, {
    ...options,
    difficulty: "easy",
    questionCount: distribution.easy,
  });

  const mediumQuestions = await generateQuiz(topic, {
    ...options,
    difficulty: "medium",
    questionCount: distribution.medium,
  });

  const hardQuestions = await generateQuiz(topic, {
    ...options,
    difficulty: "hard",
    questionCount: distribution.hard,
  });

  // Combine all questions
  const allQuestions = [
    ...easyQuestions.questions,
    ...mediumQuestions.questions,
    ...hardQuestions.questions,
  ];

  // Shuffle questions
  const shuffled = allQuestions.sort(() => Math.random() - 0.5);

  return {
    title: `${topic} - Balanced Quiz`,
    description: `A balanced quiz covering ${topic} with varying difficulty levels`,
    subject: options.subject,
    gradeLevel: options.gradeLevel,
    duration: allQuestions.length * 3, // 3 minutes per question
    totalPoints: allQuestions.reduce((sum, q) => sum + q.points, 0),
    questions: shuffled,
    metadata: {
      distribution,
      generatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Validate quiz structure
 */
export function validateQuiz(quiz: Quiz): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!quiz.title) errors.push("Quiz must have a title");
  if (!quiz.questions || quiz.questions.length === 0) {
    errors.push("Quiz must have at least one question");
  }

  quiz.questions.forEach((q, idx) => {
    if (!q.question) errors.push(`Question ${idx + 1}: Missing question text`);
    if (!q.correct_answer) errors.push(`Question ${idx + 1}: Missing correct answer`);
    if (q.type === "multiple_choice" && (!q.options || q.options.length < 2)) {
      errors.push(`Question ${idx + 1}: Multiple choice needs at least 2 options`);
    }
    if (!q.points || q.points <= 0) {
      errors.push(`Question ${idx + 1}: Invalid points value`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Export quiz to different formats
 */
export function exportQuizToJSON(quiz: Quiz): string {
  return JSON.stringify(quiz, null, 2);
}

export function exportQuizToMarkdown(quiz: Quiz): string {
  let md = `# ${quiz.title}\n\n`;

  if (quiz.description) {
    md += `${quiz.description}\n\n`;
  }

  md += `**Subject:** ${quiz.subject || "N/A"} | **Grade:** ${quiz.gradeLevel || "N/A"} | **Points:** ${quiz.totalPoints}\n\n`;
  md += `---\n\n`;

  quiz.questions.forEach((q, idx) => {
    md += `## Question ${idx + 1} (${q.points} point${q.points > 1 ? "s" : ""})\n\n`;
    md += `**${q.question}**\n\n`;

    if (q.type === "multiple_choice" && q.options) {
      q.options.forEach((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        md += `${letter}. ${opt}\n`;
      });
      md += `\n`;
    }

    if (q.explanation) {
      md += `**Answer:** ${q.correct_answer}\n\n`;
      md += `**Explanation:** ${q.explanation}\n\n`;
    }

    md += `---\n\n`;
  });

  return md;
}

/**
 * Generate practice quiz (easier, with hints)
 */
export async function generatePracticeQuiz(
  topic: string,
  options: QuizOptions
): Promise<Quiz> {
  const quiz = await generateQuiz(topic, {
    ...options,
    difficulty: "easy",
    includeExplanations: true,
  });

  // Add hints to questions
  quiz.title = `Practice Quiz: ${topic}`;
  quiz.description = "Practice quiz with hints and detailed explanations";

  quiz.questions = quiz.questions.map((q) => ({
    ...q,
    metadata: {
      ...q.metadata,
      hint: generateHint(q),
    },
  }));

  return quiz;
}

/**
 * Generate hint for a question
 */
function generateHint(question: QuizQuestion): string {
  // Extract key terms from question
  const words = question.question.split(" ");
  const keyTerms = words.filter((w) => w.length > 5);

  if (keyTerms.length > 0) {
    return `Think about ${keyTerms[0].toLowerCase()} and its relationship to the topic.`;
  }

  return "Review the relevant concepts before answering.";
}
