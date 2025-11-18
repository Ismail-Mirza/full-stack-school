import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AIPlaygroundStudent from "@/components/ai/AIPlaygroundStudent";

export default async function StudentPlaygroundPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="flex-1 p-4 flex flex-col gap-4 xl:flex-row">
      {/* Main Content */}
      <div className="w-full xl:w-2/3">
        <div className="h-full bg-white p-4 rounded-md">
          <h1 className="text-xl font-semibold mb-4">🤖 AI Playground</h1>
          <AIPlaygroundStudent userId={userId} />
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-full xl:w-1/3 flex flex-col gap-4">
        {/* Quick Start Guide */}
        <div className="bg-white p-4 rounded-md">
          <h2 className="text-lg font-semibold mb-3">Quick Start</h2>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <span className="text-2xl">🔍</span>
              <div>
                <p className="font-semibold">Research</p>
                <p className="text-gray-500">Ask questions and get answers with sources</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-2xl">🧮</span>
              <div>
                <p className="font-semibold">Math Solver</p>
                <p className="text-gray-500">Get step-by-step math solutions</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-2xl">⚛️</span>
              <div>
                <p className="font-semibold">Physics Solver</p>
                <p className="text-gray-500">Solve physics problems with explanations</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-2xl">🧪</span>
              <div>
                <p className="font-semibold">Chemistry Solver</p>
                <p className="text-gray-500">Work through chemistry equations</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="bg-lamaSkyLight p-4 rounded-md">
          <h2 className="text-lg font-semibold mb-3">💡 Tips</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            <li>• Be specific in your questions</li>
            <li>• Show your work for better help</li>
            <li>• Check sources for accuracy</li>
            <li>• Use feedback buttons to help AI learn</li>
          </ul>
        </div>

        {/* Stats */}
        <div className="bg-white p-4 rounded-md">
          <h2 className="text-lg font-semibold mb-3">📊 Your Stats</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Questions Asked</span>
              <span className="font-semibold">-</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Problems Solved</span>
              <span className="font-semibold">-</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Streak</span>
              <span className="font-semibold">-</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
