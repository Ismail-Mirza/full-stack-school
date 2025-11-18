/**
 * Analytics Utility
 * Track and analyze AI system performance
 */

import prisma from "@/lib/prisma";

export interface AnalyticsEvent {
  userId?: string;
  eventType: "query" | "retrieval" | "generation" | "feedback" | "workflow_complete" | "workflow_error";
  subject?: string;
  mode?: string;
  queryText?: string;
  documentsRetrieved?: number;
  responseTime?: number;
  tokenUsage?: number;
  success?: boolean;
  errorMessage?: string;
  metadata?: any;
}

/**
 * Log analytics event
 */
export async function logAnalytics(event: AnalyticsEvent) {
  try {
    await prisma.aIAnalytics.create({
      data: {
        userId: event.userId,
        eventType: event.eventType,
        subject: event.subject,
        mode: event.mode,
        queryText: event.queryText,
        documentsRetrieved: event.documentsRetrieved,
        responseTime: event.responseTime,
        tokenUsage: event.tokenUsage,
        success: event.success !== undefined ? event.success : true,
        errorMessage: event.errorMessage,
        metadata: event.metadata || {},
      },
    });
  } catch (error) {
    // Don't throw errors for analytics failures
    console.error("Error logging analytics:", error);
  }
}

/**
 * Get user analytics summary
 */
export async function getUserAnalytics(
  userId: string,
  timeRange?: { start: Date; end: Date }
) {
  try {
    const whereClause: any = { userId };

    if (timeRange) {
      whereClause.createdAt = {
        gte: timeRange.start,
        lte: timeRange.end,
      };
    }

    const analytics = await prisma.aIAnalytics.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
    });

    // Calculate statistics
    const totalQueries = analytics.filter((a) => a.eventType === "query").length;
    const totalWorkflows = analytics.filter((a) => a.eventType === "workflow_complete").length;
    const successfulWorkflows = analytics.filter(
      (a) => a.eventType === "workflow_complete" && a.success
    ).length;

    const avgResponseTime =
      analytics
        .filter((a) => a.responseTime)
        .reduce((sum, a) => sum + (a.responseTime || 0), 0) /
      (analytics.filter((a) => a.responseTime).length || 1);

    const totalTokens = analytics.reduce((sum, a) => sum + (a.tokenUsage || 0), 0);

    const subjectBreakdown = analytics.reduce((acc, a) => {
      if (a.subject) {
        acc[a.subject] = (acc[a.subject] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const modeBreakdown = analytics.reduce((acc, a) => {
      if (a.mode) {
        acc[a.mode] = (acc[a.mode] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    return {
      totalQueries,
      totalWorkflows,
      successRate: totalWorkflows > 0 ? successfulWorkflows / totalWorkflows : 0,
      avgResponseTime,
      totalTokens,
      subjectBreakdown,
      modeBreakdown,
      recentEvents: analytics.slice(0, 10),
    };
  } catch (error) {
    console.error("Error getting user analytics:", error);
    return null;
  }
}

/**
 * Get system-wide analytics
 */
export async function getSystemAnalytics(timeRange?: { start: Date; end: Date }) {
  try {
    const whereClause: any = {};

    if (timeRange) {
      whereClause.createdAt = {
        gte: timeRange.start,
        lte: timeRange.end,
      };
    }

    const analytics = await prisma.aIAnalytics.findMany({
      where: whereClause,
    });

    const totalUsers = new Set(analytics.map((a) => a.userId).filter(Boolean)).size;
    const totalWorkflows = analytics.filter((a) => a.eventType === "workflow_complete").length;
    const successfulWorkflows = analytics.filter(
      (a) => a.eventType === "workflow_complete" && a.success
    ).length;

    const avgResponseTime =
      analytics
        .filter((a) => a.responseTime)
        .reduce((sum, a) => sum + (a.responseTime || 0), 0) /
      (analytics.filter((a) => a.responseTime).length || 1);

    const totalDocumentsRetrieved = analytics.reduce(
      (sum, a) => sum + (a.documentsRetrieved || 0),
      0
    );

    const avgDocumentsPerQuery =
      analytics
        .filter((a) => a.documentsRetrieved)
        .reduce((sum, a) => sum + (a.documentsRetrieved || 0), 0) /
      (analytics.filter((a) => a.documentsRetrieved).length || 1);

    const errorRate =
      analytics.filter((a) => !a.success).length / (analytics.length || 1);

    const popularSubjects = Object.entries(
      analytics.reduce((acc, a) => {
        if (a.subject) {
          acc[a.subject] = (acc[a.subject] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>)
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    const popularModes = Object.entries(
      analytics.reduce((acc, a) => {
        if (a.mode) {
          acc[a.mode] = (acc[a.mode] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>)
    )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Query performance by subject
    const subjectPerformance = await getPerformanceBySubject(analytics);

    return {
      totalUsers,
      totalWorkflows,
      successRate: totalWorkflows > 0 ? successfulWorkflows / totalWorkflows : 0,
      avgResponseTime,
      totalDocumentsRetrieved,
      avgDocumentsPerQuery,
      errorRate,
      popularSubjects,
      popularModes,
      subjectPerformance,
    };
  } catch (error) {
    console.error("Error getting system analytics:", error);
    return null;
  }
}

/**
 * Get performance metrics by subject
 */
async function getPerformanceBySubject(analytics: any[]) {
  const subjectMetrics: Record<
    string,
    {
      count: number;
      avgResponseTime: number;
      successRate: number;
    }
  > = {};

  analytics.forEach((event) => {
    if (!event.subject) return;

    if (!subjectMetrics[event.subject]) {
      subjectMetrics[event.subject] = {
        count: 0,
        avgResponseTime: 0,
        successRate: 0,
      };
    }

    const metrics = subjectMetrics[event.subject];
    metrics.count += 1;

    if (event.responseTime) {
      metrics.avgResponseTime =
        (metrics.avgResponseTime * (metrics.count - 1) + event.responseTime) / metrics.count;
    }

    if (event.success !== undefined) {
      const prevSuccesses = metrics.successRate * (metrics.count - 1);
      metrics.successRate = (prevSuccesses + (event.success ? 1 : 0)) / metrics.count;
    }
  });

  return subjectMetrics;
}

/**
 * Get popular queries
 */
export async function getPopularQueries(
  subject?: string,
  mode?: string,
  limit: number = 10
) {
  try {
    const whereClause: any = {
      queryText: {
        not: null,
      },
    };

    if (subject) whereClause.subject = subject;
    if (mode) whereClause.mode = mode;

    const queries = await prisma.aIAnalytics.findMany({
      where: whereClause,
      select: {
        queryText: true,
        subject: true,
        mode: true,
      },
    });

    // Count query frequency
    const queryFrequency: Record<string, { count: number; query: string; subject?: string; mode?: string }> = {};

    queries.forEach((q) => {
      if (!q.queryText) return;

      const key = q.queryText.toLowerCase().trim();
      if (!queryFrequency[key]) {
        queryFrequency[key] = {
          count: 0,
          query: q.queryText,
          subject: q.subject || undefined,
          mode: q.mode || undefined,
        };
      }
      queryFrequency[key].count += 1;
    });

    // Sort by frequency
    const popular = Object.values(queryFrequency)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return popular;
  } catch (error) {
    console.error("Error getting popular queries:", error);
    return [];
  }
}

/**
 * Get usage trends over time
 */
export async function getUsageTrends(
  userId?: string,
  granularity: "hour" | "day" | "week" = "day",
  days: number = 30
) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const whereClause: any = {
      createdAt: {
        gte: startDate,
      },
    };

    if (userId) whereClause.userId = userId;

    const analytics = await prisma.aIAnalytics.findMany({
      where: whereClause,
      orderBy: { createdAt: "asc" },
    });

    // Group by time period
    const trends: Record<string, { count: number; success: number; avgResponseTime: number }> = {};

    analytics.forEach((event) => {
      const date = new Date(event.createdAt);
      let key: string;

      if (granularity === "hour") {
        key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:00`;
      } else if (granularity === "day") {
        key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
      } else {
        // week
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = `${weekStart.getFullYear()}-${weekStart.getMonth() + 1}-${weekStart.getDate()}`;
      }

      if (!trends[key]) {
        trends[key] = { count: 0, success: 0, avgResponseTime: 0 };
      }

      trends[key].count += 1;
      if (event.success) trends[key].success += 1;
      if (event.responseTime) {
        trends[key].avgResponseTime =
          (trends[key].avgResponseTime * (trends[key].count - 1) + event.responseTime) /
          trends[key].count;
      }
    });

    return Object.entries(trends).map(([period, data]) => ({
      period,
      ...data,
      successRate: data.success / data.count,
    }));
  } catch (error) {
    console.error("Error getting usage trends:", error);
    return [];
  }
}

/**
 * Get average performance metrics
 */
export async function getPerformanceMetrics(subject?: string, mode?: string) {
  try {
    const whereClause: any = {
      eventType: "workflow_complete",
    };

    if (subject) whereClause.subject = subject;
    if (mode) whereClause.mode = mode;

    const workflows = await prisma.aIAnalytics.findMany({
      where: whereClause,
    });

    if (workflows.length === 0) {
      return null;
    }

    const totalWorkflows = workflows.length;
    const successfulWorkflows = workflows.filter((w) => w.success).length;
    const avgResponseTime =
      workflows.reduce((sum, w) => sum + (w.responseTime || 0), 0) / totalWorkflows;
    const avgTokenUsage = workflows.reduce((sum, w) => sum + (w.tokenUsage || 0), 0) / totalWorkflows;
    const avgDocumentsRetrieved =
      workflows.reduce((sum, w) => sum + (w.documentsRetrieved || 0), 0) / totalWorkflows;

    return {
      totalWorkflows,
      successRate: successfulWorkflows / totalWorkflows,
      avgResponseTime,
      avgTokenUsage,
      avgDocumentsRetrieved,
    };
  } catch (error) {
    console.error("Error getting performance metrics:", error);
    return null;
  }
}
