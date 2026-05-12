export default function DebriefPage({ debriefData, onReset }) {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-up text-center">
        <h1 className="text-3xl font-bold text-white mb-6">Your Debrief</h1>
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 mb-8">
          <p className="text-slate-400 text-sm mb-2">Overall Score</p>
          <p className="text-5xl font-bold text-indigo-400">
            {debriefData?.overall_score ?? "—"}
            <span className="text-2xl text-slate-500 font-normal"> / 10</span>
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-all duration-150"
        >
          Start New Session
        </button>
      </div>
    </div>
  );
}
