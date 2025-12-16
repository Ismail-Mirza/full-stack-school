"use client";

import { useState, useRef, useEffect } from "react";
import { queryAIPlayground, submitAIFeedback, generateQuiz, generateExam } from "@/lib/actions-ai";
import { toast } from "react-toastify";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: number;
  sources?: string[];
  timestamp: Date;
};

type Mode = "research" | "math_solver" | "physics_solver" | "chemistry_solver" | "quiz_creator" | "exam_creator";

const MODES = [
  { value: "research" as Mode, label: "🔍 Research", description: "Find information" },
  { value: "math_solver" as Mode, label: "🧮 Math", description: "Solve problems" },
  { value: "physics_solver" as Mode, label: "⚛️ Physics", description: "Physics help" },
  { value: "chemistry_solver" as Mode, label: "🧪 Chemistry", description: "Chemistry help" },
  { value: "quiz_creator" as Mode, label: "📝 Quiz", description: "Generate quiz" },
  { value: "exam_creator" as Mode, label: "📋 Exam", description: "Create exam" },
];

export default function AIPlaygroundTeacher({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("research");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [showQuizForm, setShowQuizForm] = useState(false);
  const [showExamForm, setShowExamForm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || isLoading) return;

    // Special handling for content generation modes
    if (mode === "quiz_creator") {
      setShowQuizForm(true);
      return;
    }

    if (mode === "exam_creator") {
      setShowExamForm(true);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const result = await queryAIPlayground(input, {
        mode,
        conversationId,
      });

      if (result.success && result.data) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: result.data.answer,
          confidence: result.data.confidence,
          sources: result.data.sources,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setConversationId(result.data.conversationId);
      } else {
        toast.error(result.message || "Failed to get response");
      }
    } catch (error) {
      console.error("Error querying AI:", error);
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowQuizForm(false);
    setIsLoading(true);

    try {
      const result = await generateQuiz(input, {
        questionCount: 10,
        difficulty: "medium",
      });

      if (result.success && result.data) {
        const quizMessage: Message = {
          id: Date.now().toString(),
          role: "assistant",
          content: `✅ Quiz generated successfully!\n\nTitle: ${result.data.quiz.title}\nQuestions: ${result.data.quiz.questions.length}\nTotal Points: ${result.data.quiz.totalPoints}\n\nQuiz ID: ${result.data.contentId}\n\nYou can view and edit this quiz in the Generated Content section.`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, quizMessage]);
        toast.success("Quiz generated successfully!");
      } else {
        toast.error(result.message || "Failed to generate quiz");
      }
    } catch (error) {
      console.error("Error generating quiz:", error);
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
      setInput("");
    }
  };

  const handleGenerateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowExamForm(false);
    setIsLoading(true);

    try {
      const topics = input.split(",").map((t) => t.trim());

      const result = await generateExam(topics, {
        duration: 90,
        totalPoints: 100,
      });

      if (result.success && result.data) {
        const examMessage: Message = {
          id: Date.now().toString(),
          role: "assistant",
          content: `✅ Exam generated successfully!\n\nTitle: ${result.data.exam.title}\nDuration: ${result.data.exam.duration} minutes\nTotal Points: ${result.data.exam.totalPoints}\nSections: ${result.data.exam.sections.length}\n\nExam ID: ${result.data.contentId}\n\nYou can view and edit this exam in the Generated Content section.`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, examMessage]);
        toast.success("Exam generated successfully!");
      } else {
        toast.error(result.message || "Failed to generate exam");
      }
    } catch (error) {
      console.error("Error generating exam:", error);
      toast.error("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
      setInput("");
    }
  };

  const handleFeedback = async (messageId: string, feedbackType: "thumbs_up" | "thumbs_down") => {
    if (!conversationId) return;

    try {
      await submitAIFeedback(messageId, conversationId, {
        feedbackType,
      });
      toast.success("Feedback submitted!");
    } catch (error) {
      console.error("Error submitting feedback:", error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Mode Selector */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {MODES.map((m) => (
          <button
            key={m.value}
            onClick={() => setMode(m.value)}
            className={`px-4 py-2 rounded-md text-sm whitespace-nowrap transition-colors ${
              mode === m.value
                ? "bg-lamaSky text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto mb-4 space-y-4 p-4 bg-gray-50 rounded-md">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-4xl mb-4">🤖</p>
            <p className="text-lg font-semibold">Welcome, Teacher!</p>
            <p className="text-sm mt-2">
              Select a mode above and start creating content or asking questions.
            </p>
            {mode === "quiz_creator" && (
              <div className="mt-4 text-xs bg-lamaYellowLight p-3 rounded-md inline-block">
                💡 Enter a topic to generate a quiz
              </div>
            )}
            {mode === "exam_creator" && (
              <div className="mt-4 text-xs bg-lamaYellowLight p-3 rounded-md inline-block">
                💡 Enter topics (comma-separated) to generate an exam
              </div>
            )}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  message.role === "user"
                    ? "bg-lamaSky text-white"
                    : "bg-white border border-gray-200"
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-xl">
                    {message.role === "user" ? "👤" : "🤖"}
                  </span>
                  <div className="flex-1">
                    <p className="whitespace-pre-wrap">{message.content}</p>

                    {message.role === "assistant" && (
                      <div className="mt-3 space-y-2">
                        {message.confidence !== undefined && (
                          <div className="text-xs text-gray-500">
                            Confidence: {(message.confidence * 100).toFixed(0)}%
                          </div>
                        )}

                        {message.sources && message.sources.length > 0 && (
                          <div className="text-xs">
                            <p className="font-semibold text-gray-700">Sources:</p>
                            <ul className="list-disc list-inside text-gray-600">
                              {message.sources.map((source, idx) => (
                                <li key={idx}>{source}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleFeedback(message.id, "thumbs_up")}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                          >
                            👍
                          </button>
                          <button
                            onClick={() => handleFeedback(message.id, "thumbs_down")}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                          >
                            👎
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-lg p-4 max-w-[80%]">
              <div className="flex items-center gap-2">
                <span className="text-xl">🤖</span>
                <div className="flex gap-1">
                  <span className="animate-bounce">●</span>
                  <span className="animate-bounce delay-100">●</span>
                  <span className="animate-bounce delay-200">●</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={mode === "quiz_creator" ? handleGenerateQuiz : mode === "exam_creator" ? handleGenerateExam : handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            mode === "quiz_creator"
              ? "Enter quiz topic..."
              : mode === "exam_creator"
              ? "Enter topics (comma-separated)..."
              : `Ask a ${mode.replace("_", " ")} question...`
          }
          className="flex-1 px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-lamaSky"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-6 py-3 bg-lamaSky text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "..." : mode === "quiz_creator" || mode === "exam_creator" ? "Generate" : "Send"}
        </button>
      </form>

      {/* Helper text for content generation modes */}
      {(mode === "quiz_creator" || mode === "exam_creator") && (
        <p className="text-xs text-gray-500 mt-2">
          {mode === "quiz_creator"
            ? "💡 Enter a topic and click Generate to create a quiz"
            : "💡 Enter topics separated by commas and click Generate to create an exam"}
        </p>
      )}
    </div>
  );
}
