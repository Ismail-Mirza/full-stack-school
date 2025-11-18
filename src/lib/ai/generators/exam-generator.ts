/**
 * Exam Generator
 * Generates comprehensive exams with multiple sections
 */

import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { retrieveDocuments } from "../utils/vector-store";
import { QuizQuestion } from "./quiz-generator";

const llm = new ChatOpenAI({
  modelName: "gpt-4o",
  temperature: 0.7,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

export interface ExamSection {
  title: string;
  instructions: string;
  questions: QuizQuestion[];
  points: number;
  timeRecommendation?: number;
}

export interface Exam {
  title: string;
  description?: string;
  subject?: string;
  gradeLevel?: number;
  duration: number;
  totalPoints: number;
  sections: ExamSection[];
  instructions?: string;
  answerKey?: any;
  rubric?: any;
  metadata?: any;
}

export interface ExamOptions {
  subject?: string;
  gradeLevel?: number;
  duration?: number;
  totalPoints?: number;
  sections?: {
    title: string;
    questionCount: number;
    questionTypes?: string[];
    difficulty?: string;
  }[];
  includeAnswerKey?: boolean;
  includeRubric?: boolean;
}

/**
 * Generate comprehensive exam
 */
export async function generateExam(
  topics: string[],
  options: ExamOptions = {}
): Promise<Exam> {
  const {
    subject,
    gradeLevel,
    duration = 90,
    totalPoints = 100,
    sections = [
      { title: "Multiple Choice", questionCount: 20, questionTypes: ["multiple_choice"], difficulty: "easy" },
      { title: "Short Answer", questionCount: 5, questionTypes: ["short_answer"], difficulty: "medium" },
      { title: "Essay", questionCount: 2, questionTypes: ["essay"], difficulty: "hard" },
    ],
    includeAnswerKey = true,
    includeRubric = true,
  } = options;

  try {
    // Retrieve relevant documents for all topics
    const allDocuments = await Promise.all(
      topics.map((topic) =>
        retrieveDocuments(topic, {
          subject,
          gradeLevel,
          userRole: "teacher",
          topK: 3,
        })
      )
    );

    const documents = allDocuments.flat();

    // Prepare context
    const context = documents
      .map((doc) => `[${doc.metadata.documentTitle}]\n${doc.content}`)
      .join("\n\n---\n\n");

    // Create prompt
    const examPrompt = PromptTemplate.fromTemplate(`
You are an expert educational assessment designer creating a comprehensive exam.

TOPICS: {topics}
SUBJECT: {subject}
GRADE LEVEL: {gradeLevel}
DURATION: {duration} minutes
TOTAL POINTS: {totalPoints}

SECTIONS TO CREATE:
{sectionsDescription}

CONTEXT FROM EDUCATIONAL MATERIALS:
{context}

Create a comprehensive exam covering all topics with the specified sections.

Requirements:
1. Cover all topics proportionally
2. Questions should increase in difficulty within each section
3. Clear, unambiguous questions
4. Age-appropriate language
5. Include detailed instructions for each section
6. Create a comprehensive answer key
7. Include grading rubric for essay questions

Format as JSON:
{{
  "title": "Comprehensive Exam Title",
  "description": "Exam description",
  "duration": {duration},
  "totalPoints": {totalPoints},
  "instructions": "General exam instructions",
  "sections": [
    {{
      "title": "Section Title",
      "instructions": "Section-specific instructions",
      "timeRecommendation": 30,
      "points": 40,
      "questions": [
        {{
          "type": "multiple_choice",
          "question": "Question text?",
          "options": ["A", "B", "C", "D"],
          "correct_answer": "A",
          "explanation": "Why this is correct",
          "points": 2,
          "difficulty": "easy"
        }}
      ]
    }}
  ],
  "answerKey": {{
    "section1": {{
      "q1": "Answer",
      "q2": "Answer"
    }}
  }},
  "rubric": {{
    "essay": {{
      "criteria": ["Content", "Organization", "Grammar"],
      "scoring": "Point breakdown for each criterion"
    }}
  }}
}}

Generate the exam now:`);

    const sectionsDescription = sections
      .map(
        (s, i) =>
          `Section ${i + 1}: ${s.title} - ${s.questionCount} questions (${s.questionTypes?.join(", ") || "mixed"}) - ${s.difficulty || "medium"} difficulty`
      )
      .join("\n");

    const chain = examPrompt.pipe(llm).pipe(new StringOutputParser());

    const response = await chain.invoke({
      topics: topics.join(", "),
      subject: subject || "General",
      gradeLevel: gradeLevel || "Not specified",
      duration,
      totalPoints,
      sectionsDescription,
      context: context || "No specific context available - use general knowledge",
    });

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse exam JSON from response");
    }

    const exam: Exam = JSON.parse(jsonMatch[0]);

    // Validate exam structure
    if (!exam.sections || exam.sections.length === 0) {
      throw new Error("Generated exam has no sections");
    }

    // Add metadata
    exam.metadata = {
      topics,
      generatedAt: new Date().toISOString(),
      includeAnswerKey,
      includeRubric,
    };

    return exam;
  } catch (error: any) {
    console.error("Error generating exam:", error);
    throw new Error(`Exam generation failed: ${error.message}`);
  }
}

/**
 * Generate exam from lesson IDs
 */
export async function generateExamFromLessons(
  lessonIds: number[],
  options: ExamOptions
): Promise<Exam> {
  // In a real implementation, fetch lesson data from database
  // For now, return a placeholder
  return generateExam(["Lessons " + lessonIds.join(", ")], options);
}

/**
 * Validate exam structure
 */
export function validateExam(exam: Exam): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!exam.title) errors.push("Exam must have a title");
  if (!exam.duration || exam.duration <= 0) errors.push("Exam must have valid duration");
  if (!exam.sections || exam.sections.length === 0) {
    errors.push("Exam must have at least one section");
  }

  let totalPoints = 0;
  exam.sections.forEach((section, sIdx) => {
    if (!section.title) errors.push(`Section ${sIdx + 1}: Missing title`);
    if (!section.questions || section.questions.length === 0) {
      errors.push(`Section ${sIdx + 1}: No questions`);
    }

    section.questions.forEach((q, qIdx) => {
      if (!q.question) {
        errors.push(`Section ${sIdx + 1}, Question ${qIdx + 1}: Missing question text`);
      }
      if (!q.correct_answer) {
        errors.push(`Section ${sIdx + 1}, Question ${qIdx + 1}: Missing correct answer`);
      }
      totalPoints += q.points || 0;
    });
  });

  if (Math.abs(totalPoints - exam.totalPoints) > 5) {
    errors.push(`Total points mismatch: expected ${exam.totalPoints}, got ${totalPoints}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Export exam to different formats
 */
export function exportExamToJSON(exam: Exam): string {
  return JSON.stringify(exam, null, 2);
}

export function exportExamToMarkdown(exam: Exam, includeAnswers: boolean = false): string {
  let md = `# ${exam.title}\n\n`;

  if (exam.description) {
    md += `${exam.description}\n\n`;
  }

  md += `**Subject:** ${exam.subject || "N/A"} | **Grade:** ${exam.gradeLevel || "N/A"}\n`;
  md += `**Duration:** ${exam.duration} minutes | **Total Points:** ${exam.totalPoints}\n\n`;

  if (exam.instructions) {
    md += `## Instructions\n\n${exam.instructions}\n\n`;
  }

  md += `---\n\n`;

  exam.sections.forEach((section, sIdx) => {
    md += `# Section ${sIdx + 1}: ${section.title} (${section.points} points)\n\n`;

    if (section.instructions) {
      md += `**Instructions:** ${section.instructions}\n\n`;
    }

    if (section.timeRecommendation) {
      md += `*Recommended time: ${section.timeRecommendation} minutes*\n\n`;
    }

    section.questions.forEach((q, qIdx) => {
      md += `### Question ${qIdx + 1} (${q.points} point${q.points > 1 ? "s" : ""})\n\n`;
      md += `${q.question}\n\n`;

      if (q.type === "multiple_choice" && q.options) {
        q.options.forEach((opt, i) => {
          const letter = String.fromCharCode(65 + i);
          md += `${letter}. ${opt}\n`;
        });
        md += `\n`;
      }

      if (q.type === "essay") {
        md += `*Use the space below for your answer:*\n\n`;
        md += `_________________________________________________________________________\n\n`;
        md += `_________________________________________________________________________\n\n`;
        md += `_________________________________________________________________________\n\n`;
      }

      if (includeAnswers) {
        md += `**✓ Answer:** ${q.correct_answer}\n`;
        if (q.explanation) {
          md += `**Explanation:** ${q.explanation}\n`;
        }
      }

      md += `\n`;
    });

    md += `---\n\n`;
  });

  // Add answer key section if included
  if (includeAnswers && exam.answerKey) {
    md += `# Answer Key\n\n`;
    md += `\`\`\`json\n${JSON.stringify(exam.answerKey, null, 2)}\n\`\`\`\n\n`;
  }

  // Add rubric if included
  if (includeAnswers && exam.rubric) {
    md += `# Grading Rubric\n\n`;
    md += `\`\`\`json\n${JSON.stringify(exam.rubric, null, 2)}\n\`\`\`\n\n`;
  }

  return md;
}

/**
 * Create student version (without answers)
 */
export function createStudentVersion(exam: Exam): Exam {
  const studentExam = { ...exam };

  // Remove answer key and rubric
  delete studentExam.answerKey;
  delete studentExam.rubric;

  // Remove explanations from questions
  studentExam.sections = studentExam.sections.map((section) => ({
    ...section,
    questions: section.questions.map((q) => {
      const studentQ = { ...q };
      delete studentQ.explanation;
      delete studentQ.correct_answer;
      return studentQ;
    }),
  }));

  return studentExam;
}

/**
 * Create teacher version (with answers and rubric)
 */
export function createTeacherVersion(exam: Exam): Exam {
  // Teacher version is the full exam
  return { ...exam };
}

/**
 * Calculate recommended time per section
 */
export function calculateSectionTimes(exam: Exam): Exam {
  const totalQuestions = exam.sections.reduce(
    (sum, s) => sum + s.questions.length,
    0
  );

  const updatedSections = exam.sections.map((section) => {
    const sectionQuestions = section.questions.length;
    const timePercentage = sectionQuestions / totalQuestions;
    const recommendedTime = Math.round(exam.duration * timePercentage);

    return {
      ...section,
      timeRecommendation: recommendedTime,
    };
  });

  return {
    ...exam,
    sections: updatedSections,
  };
}

/**
 * Link exam to existing Exam model in database
 */
export async function linkToExamModel(
  generatedExamId: string,
  lessonId: number,
  startTime: Date,
  endTime: Date
) {
  // This would create an entry in the existing Exam table
  // linking to the AIGeneratedContent
  // Implementation depends on your specific needs
  return {
    generatedExamId,
    lessonId,
    startTime,
    endTime,
  };
}
