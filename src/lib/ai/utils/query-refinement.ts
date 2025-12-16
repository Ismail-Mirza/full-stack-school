/**
 * Query Refinement Utility
 * Self-learning query optimization using historical data
 */

import prisma from "@/lib/prisma";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.3,
  openAIApiKey: process.env.OPENAI_API_KEY,
});

/**
 * Refine query using historical successful refinements
 */
export async function refineQuery(
  originalQuery: string,
  mode: string,
  subject?: string,
  attemptNumber: number = 0
): Promise<string> {
  try {
    // First attempt: return original query
    if (attemptNumber === 0) {
      return originalQuery;
    }

    // Look for similar successful refinements
    const historicalRefinements = await prisma.aIQueryRefinement.findMany({
      where: {
        mode,
        subject: subject || undefined,
        improvementScore: {
          gte: 0.7, // Only use successful refinements
        },
      },
      orderBy: [
        { usageCount: "desc" },
        { improvementScore: "desc" },
      ],
      take: 5,
    });

    // If we have historical data, use it to guide refinement
    let refinementContext = "";
    if (historicalRefinements.length > 0) {
      refinementContext = historicalRefinements
        .map(
          (ref) =>
            `Original: "${ref.originalQuery}" → Refined: "${ref.refinedQuery}" (Score: ${ref.improvementScore})`
        )
        .join("\n");
    }

    // Use LLM to refine query
    const refinementPrompt = PromptTemplate.fromTemplate(`
You are a query refinement specialist for an educational AI system.

Mode: {mode}
Subject: {subject}
Attempt: {attemptNumber}

Your task is to refine the following query to improve retrieval from our educational knowledge base.

Original Query: "{originalQuery}"

{refinementGuidance}

Consider:
1. Add relevant educational terminology
2. Make it more specific to the subject
3. Include grade-appropriate language
4. Expand abbreviations and acronyms
5. Add context for better retrieval

Refined Query:`);

    let refinementGuidance = "";
    if (historicalRefinements.length > 0) {
      refinementGuidance = `Here are examples of successful refinements:\n${refinementContext}\n\nFollow similar patterns.`;
    } else {
      refinementGuidance = `No historical data available. Use your best judgment based on the mode and subject.`;
    }

    const chain = refinementPrompt.pipe(llm);

    const result = await chain.invoke({
      mode,
      subject: subject || "general",
      attemptNumber,
      originalQuery,
      refinementGuidance,
    });

    const refinedQuery = result.content.toString().trim();

    // Store this refinement attempt for future learning
    await storeRefinementAttempt(originalQuery, refinedQuery, mode, subject);

    console.log(`Query refined (attempt ${attemptNumber}): "${originalQuery}" → "${refinedQuery}"`);

    return refinedQuery;
  } catch (error) {
    console.error("Error refining query:", error);
    return originalQuery; // Fallback to original
  }
}

/**
 * Store refinement attempt for self-learning
 */
async function storeRefinementAttempt(
  originalQuery: string,
  refinedQuery: string,
  mode: string,
  subject?: string
) {
  try {
    // Check if similar refinement exists
    const existing = await prisma.aIQueryRefinement.findFirst({
      where: {
        originalQuery: {
          equals: originalQuery,
          mode: "insensitive",
        },
        refinedQuery: {
          equals: refinedQuery,
          mode: "insensitive",
        },
        mode,
        subject,
      },
    });

    if (existing) {
      // Update usage count
      await prisma.aIQueryRefinement.update({
        where: { id: existing.id },
        data: {
          usageCount: { increment: 1 },
          lastUsed: new Date(),
        },
      });
    } else {
      // Create new refinement record
      await prisma.aIQueryRefinement.create({
        data: {
          originalQuery,
          refinedQuery,
          mode,
          subject,
          improvementScore: null, // Will be updated based on feedback
          usageCount: 1,
          lastUsed: new Date(),
        },
      });
    }
  } catch (error) {
    console.error("Error storing refinement attempt:", error);
  }
}

/**
 * Update refinement improvement score based on feedback
 */
export async function updateRefinementScore(
  originalQuery: string,
  refinedQuery: string,
  mode: string,
  improvementScore: number
) {
  try {
    const refinement = await prisma.aIQueryRefinement.findFirst({
      where: {
        originalQuery: {
          equals: originalQuery,
          mode: "insensitive",
        },
        refinedQuery: {
          equals: refinedQuery,
          mode: "insensitive",
        },
        mode,
      },
    });

    if (refinement) {
      // Calculate weighted average if score already exists
      const currentScore = refinement.improvementScore || 0;
      const usageCount = refinement.usageCount;
      const newScore = (currentScore * usageCount + improvementScore) / (usageCount + 1);

      await prisma.aIQueryRefinement.update({
        where: { id: refinement.id },
        data: {
          improvementScore: newScore,
        },
      });

      console.log(`Updated refinement score: ${currentScore.toFixed(2)} → ${newScore.toFixed(2)}`);
    }
  } catch (error) {
    console.error("Error updating refinement score:", error);
  }
}

/**
 * Expand subject-specific abbreviations and terminology
 */
function expandSubjectTerminology(query: string, subject?: string): string {
  const expansions: Record<string, Record<string, string>> = {
    math: {
      "eq": "equation",
      "sol": "solution",
      "deriv": "derivative",
      "integ": "integral",
      "trig": "trigonometry",
      "calc": "calculus",
      "geo": "geometry",
      "alg": "algebra",
    },
    physics: {
      "vel": "velocity",
      "acc": "acceleration",
      "thermo": "thermodynamics",
      "mech": "mechanics",
      "elec": "electricity",
      "mag": "magnetism",
      "optics": "optics",
    },
    chemistry: {
      "rxn": "reaction",
      "mol": "mole",
      "conc": "concentration",
      "eq": "equilibrium",
      "org": "organic",
      "inorg": "inorganic",
    },
  };

  if (!subject || !expansions[subject.toLowerCase()]) {
    return query;
  }

  let expandedQuery = query;
  const subjectExpansions = expansions[subject.toLowerCase()];

  for (const [abbr, full] of Object.entries(subjectExpansions)) {
    const regex = new RegExp(`\\b${abbr}\\b`, "gi");
    expandedQuery = expandedQuery.replace(regex, full);
  }

  return expandedQuery;
}

/**
 * Analyze query effectiveness based on feedback
 */
export async function analyzeQueryEffectiveness(
  mode: string,
  subject?: string,
  timeRange?: { start: Date; end: Date }
) {
  try {
    const whereClause: any = { mode };
    if (subject) whereClause.subject = subject;

    const refinements = await prisma.aIQueryRefinement.findMany({
      where: whereClause,
      orderBy: { improvementScore: "desc" },
      take: 100,
    });

    const stats = {
      totalRefinements: refinements.length,
      avgImprovementScore:
        refinements.reduce((sum, r) => sum + (r.improvementScore || 0), 0) / refinements.length,
      topPatterns: await identifySuccessfulPatterns(refinements),
      recommendations: generateRecommendations(refinements),
    };

    return stats;
  } catch (error) {
    console.error("Error analyzing query effectiveness:", error);
    return null;
  }
}

/**
 * Identify successful refinement patterns
 */
async function identifySuccessfulPatterns(
  refinements: Array<{
    originalQuery: string;
    refinedQuery: string;
    improvementScore: number | null;
    usageCount: number;
  }>
) {
  const successfulRefinements = refinements.filter(
    (r) => r.improvementScore && r.improvementScore > 0.7
  );

  // Analyze patterns
  const patterns = {
    addedTerms: [] as string[],
    removedTerms: [] as string[],
    expansions: [] as { from: string; to: string }[],
  };

  successfulRefinements.forEach((ref) => {
    const originalWords = new Set(ref.originalQuery.toLowerCase().split(/\s+/));
    const refinedWords = new Set(ref.refinedQuery.toLowerCase().split(/\s+/));

    // Find added words
    refinedWords.forEach((word) => {
      if (!originalWords.has(word) && word.length > 3) {
        patterns.addedTerms.push(word);
      }
    });
  });

  // Count frequency
  const termFrequency = patterns.addedTerms.reduce((acc, term) => {
    acc[term] = (acc[term] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Get top terms
  const topTerms = Object.entries(termFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => ({ term, count }));

  return topTerms;
}

/**
 * Generate recommendations for query improvement
 */
function generateRecommendations(
  refinements: Array<{
    originalQuery: string;
    refinedQuery: string;
    improvementScore: number | null;
  }>
) {
  const recommendations: string[] = [];

  const avgQueryLength =
    refinements.reduce((sum, r) => sum + r.refinedQuery.split(/\s+/).length, 0) /
    refinements.length;

  if (avgQueryLength < 5) {
    recommendations.push("Consider adding more specific terms to queries");
  }

  const successRate =
    refinements.filter((r) => r.improvementScore && r.improvementScore > 0.7).length /
    refinements.length;

  if (successRate < 0.5) {
    recommendations.push("Query refinement strategy may need adjustment");
  }

  return recommendations;
}
