export default function QuestionsReadyPage({ sessionData, onStartInterview, onBack }) {
  const { questions } = sessionData;

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-2xl animate-fade-up">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Your Questions Are Ready</h1>
          <p className="text-gray-400 text-base">
            You have 5 behavioral questions prepared for your session.
          </p>
        </div>

        {/* Questions list */}
        <ol className="space-y-4 mb-10">
          {questions.map((q, i) => (
            <li
              key={q.id}
              className="bg-gray-800 border border-gray-700 rounded-xl px-6 py-5"
            >
              <div className="flex items-start gap-4">
                <span className="text-indigo-400 font-bold text-lg shrink-0 w-6">{i + 1}.</span>
                <div className="flex-1">
                  <p className="text-white text-sm leading-relaxed mb-2">{q.question}</p>
                  <span className="inline-block text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full">
                    {q.arc_position.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ol>

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
