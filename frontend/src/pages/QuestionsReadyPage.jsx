export default function QuestionsReadyPage({ sessionData, onStartInterview, onBack }) {
  const { job_title, company_name, source } = sessionData;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-2xl animate-fade-up">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-600/20 border border-indigo-500/30 mb-6">
            <svg className="w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">Your Interview Is Ready</h1>
          <p className="text-gray-400 text-base">
            5 questions prepared for{" "}
            <span className="text-white font-medium">
              {company_name ? `${job_title} at ${company_name}` : job_title}
            </span>
          </p>
          {source === "jd" && (
            <p className="text-indigo-400 text-sm mt-2">Personalized to your job description</p>
          )}
        </div>

        {/* Rules reminder */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl px-6 py-5 mb-8 space-y-2">
          <p className="text-gray-300 text-sm">
            <span className="text-white font-medium">60 seconds</span> to prepare for each question, then a{" "}
            <span className="text-white font-medium">2 minute</span> answer window.
          </p>
          <p className="text-gray-300 text-sm">
            <span className="text-white font-medium">One attempt per question</span> — no retakes.
          </p>
          <p className="text-gray-300 text-sm">
            Your video is shown once after each answer, then permanently discarded.
          </p>
        </div>

        {/* Start Interview button */}
        <button
          type="button"
          onClick={onStartInterview}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-all duration-150 mb-6"
        >
          Start Interview
        </button>

        {/* Start Over link */}
        <div className="text-center">
          <button
            type="button"
            onClick={onBack}
            className="text-gray-400 hover:text-white text-sm transition-colors duration-150"
          >
            ← Start Over
          </button>
        </div>
      </div>
    </div>
  );
}
