"use client";

import { useState, useRef, useEffect } from "react";
import { queryAIPlayground, submitAIFeedback } from "@/lib/actions-ai";
import { toast } from "react-toastify";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  confidence?: number;
  sources?: string[];
  timestamp: Date;
};

type Mode = "research" | "math_solver" | "physics_solver" | "chemistry_solver";

const MODES = [
  { value: "research" as Mode, label: "🔍 Research", description: "Ask any question" },
  { value: "math_solver" as Mode, label: "🧮 Math", description: "Solve math problems" },
  { value: "physics_solver" as Mode, label: "⚛️ Physics", description: "Physics problems" },
  { value: "chemistry_solver" as Mode, label: "🧪 Chemistry", description: "Chemistry help" },
];

export default function AIPlaygroundStudent({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("research");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
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
            <p className="text-lg font-semibold">Welcome to AI Playground!</p>
            <p className="text-sm mt-2">
              Select a mode above and ask your question to get started.
            </p>
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
                        {/* Confidence Score */}
                        {message.confidence !== undefined && (
                          <div className="text-xs text-gray-500">
                            Confidence: {(message.confidence * 100).toFixed(0)}%
                          </div>
                        )}

                        {/* Sources */}
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

                        {/* Feedback Buttons */}
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleFeedback(message.id, "thumbs_up")}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                            title="Helpful"
                          >
                            👍
                          </button>
                          <button
                            onClick={() => handleFeedback(message.id, "thumbs_down")}
                            className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded"
                            title="Not helpful"
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
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask a ${mode.replace("_", " ")} question...`}
          className="flex-1 px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-lamaSky"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-6 py-3 bg-lamaSky text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? "..." : "Send"}
        </button>
      </form>
    </div>
  );
}
