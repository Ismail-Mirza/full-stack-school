import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import AIPlaygroundTeacher from "@/components/ai/AIPlaygroundTeacher";
import Link from "next/link";

export default async function TeacherPlaygroundPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  return (
    <div className="flex-1 p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="bg-white p-4 rounded-md flex justify-between items-center">
        <div>
          <h1 className="text-xl font-semibold">🤖 AI Playground</h1>
          <p className="text-sm text-gray-500">Your AI-powered teaching assistant</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/teacher/playground/documents"
            className="px-4 py-2 bg-lamaSky text-white rounded-md hover:bg-blue-600 text-sm"
          >
            📚 Documents
          </Link>
          <Link
            href="/teacher/playground/content"
            className="px-4 py-2 bg-lamaPurple text-white rounded-md hover:bg-purple-600 text-sm"
          >
            📝 Generated Content
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex gap-4 xl:flex-row flex-col">
        {/* AI Interface */}
        <div className="w-full xl:w-2/3">
          <div className="bg-white p-4 rounded-md h-[calc(100vh-250px)]">
            <AIPlaygroundTeacher userId={userId} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full xl:w-1/3 flex flex-col gap-4">
          {/* Teacher Features */}
          <div className="bg-white p-4 rounded-md">
            <h2 className="text-lg font-semibold mb-3">Teacher Tools</h2>
            <div className="space-y-3 text-sm">
              <div className="flex gap-3">
                <span className="text-2xl">🔍</span>
                <div>
                  <p className="font-semibold">Research</p>
                  <p className="text-gray-500">Find information with sources</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl">🧮</span>
                <div>
                  <p className="font-semibold">Problem Solvers</p>
                  <p className="text-gray-500">Math, Physics, Chemistry</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl">📝</span>
                <div>
                  <p className="font-semibold">Quiz Creator</p>
                  <p className="text-gray-500">Generate quizzes from topics</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl">📋</span>
                <div>
                  <p className="font-semibold">Exam Builder</p>
                  <p className="text-gray-500">Create comprehensive exams</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-2xl">🎨</span>
                <div>
                  <p className="font-semibold">Slides & Posters</p>
                  <p className="text-gray-500">Generate presentations</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-lamaYellowLight p-4 rounded-md">
            <h2 className="text-lg font-semibold mb-3">Quick Actions</h2>
            <div className="space-y-2">
              <button className="w-full px-4 py-2 bg-white rounded-md hover:bg-gray-50 text-sm text-left">
                📚 Upload Teaching Materials
              </button>
              <button className="w-full px-4 py-2 bg-white rounded-md hover:bg-gray-50 text-sm text-left">
                📝 Create New Quiz
              </button>
              <button className="w-full px-4 py-2 bg-white rounded-md hover:bg-gray-50 text-sm text-left">
                📊 View Analytics
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-white p-4 rounded-md">
            <h2 className="text-lg font-semibold mb-3">📊 Usage Stats</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Documents Uploaded</span>
                <span className="font-semibold">-</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Quizzes Generated</span>
                <span className="font-semibold">-</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Total Queries</span>
                <span className="font-semibold">-</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
