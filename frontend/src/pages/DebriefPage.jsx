import { useState } from "react";

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ScoreRing({ score }) {
  const pct = score != null ? (score / 10) * 100 : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} stroke="#1e293b" strokeWidth="8" fill="none" />
        <circle
          cx="50" cy="50" r={radius}
          stroke="#6366f1"
          strokeWidth="8"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-2xl font-bold text-white leading-none">{score ?? "—"}</p>
        <p className="text-xs text-slate-400">/10</p>
      </div>
    </div>
  );
}

function DimensionCard({ label, score }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
      <p className="text-2xl font-bold text-indigo-400">{score ?? "—"}</p>
      <p className="text-slate-400 text-xs mt-1">{label}</p>
    </div>
  );
}

const ARC_LABELS = {
  motivation: "Motivation",
  general_behavioral: "General",
  role_context: "Role Context",
  jd_specific: "JD-Specific",
  depth: "Depth",
};

export default function DebriefPage({ debriefData, sessionSource, sessionQuestions, onReset }) {
  const [openIndex, setOpenIndex] = useState(null);

  if (!debriefData) return null;

  const {
    overall_score,
    dimension_averages,
    top_weaknesses,
    summary_text,
    questions,
  } = debriefData;

  const isJD = sessionSource === "jd";
  const questionMap = (sessionQuestions ?? []).reduce((acc, q) => {
    acc[q.id] = q;
    return acc;
  }, {});

  const dimensions = [
    { label: "STAR", score: dimension_averages?.star },
    { label: "Content", score: dimension_averages?.content },
    { label: "Relevance", score: dimension_averages?.relevance },
    ...(isJD ? [{ label: "JD Alignment", score: dimension_averages?.jd_alignment }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-900 text-white px-4 py-12">
      <div className="w-full max-w-2xl mx-auto animate-fade-up">

        {/* ── SECTION 1: SESSION SCORECARD ── */}
        <h1 className="text-2xl font-bold text-white mb-8">Your Debrief</h1>

        {/* Overall score */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 mb-6 flex flex-col items-center">
          <ScoreRing score={overall_score} />
          <p className="text-slate-400 text-sm mt-3">Overall Score</p>
        </div>

        {/* Dimension averages */}
        <div className={`grid gap-4 mb-6 ${isJD ? "grid-cols-4" : "grid-cols-3"}`}>
          {dimensions.map((d) => (
            <DimensionCard key={d.label} label={d.label} score={d.score} />
          ))}
        </div>

        {/* Top weaknesses */}
        {top_weaknesses?.length > 0 && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
            <h2 className="text-white font-semibold mb-3">Top Weaknesses</h2>
            <ul className="space-y-2">
              {top_weaknesses.map((w, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-red-400 mt-0.5 flex-shrink-0">•</span>
                  <p className="text-slate-300 text-sm leading-relaxed">{w}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Summary */}
        {summary_text && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-10">
            <h2 className="text-white font-semibold mb-3">Session Summary</h2>
            <p className="text-slate-300 text-sm leading-relaxed">{summary_text}</p>
          </div>
        )}

        {/* ── SECTION 2: PER-QUESTION ACCORDION ── */}
        <h2 className="text-lg font-semibold text-white mb-4">Question Breakdown</h2>
        <div className="space-y-3 mb-10">
          {questions?.map((q, i) => {
            const isOpen = openIndex === i;
            const meta = questionMap[q.id] ?? {};
            const arcLabel = ARC_LABELS[meta.arc_position] ?? meta.arc_position ?? "";
            return (
              <div key={q.id} className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                {/* Collapsed row */}
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-750 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400 text-sm font-medium">Q{q.id}</span>
                    {arcLabel && (
                      <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">
                        {arcLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-indigo-400 font-semibold text-sm">
                      {q.composite_score ?? "—"}<span className="text-slate-500 font-normal">/10</span>
                    </span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div className="px-5 pb-5 border-t border-slate-700">
                    {/* Question text */}
                    <p className="text-slate-300 text-sm leading-relaxed mt-4 mb-5">{meta.question ?? `Question ${q.id}`}</p>

                    {/* Dimension scores */}
                    <div className={`grid gap-3 mb-4 ${isJD ? "grid-cols-4" : "grid-cols-3"}`}>
                      <div className="text-center">
                        <p className="text-lg font-bold text-indigo-400">{q.star_score ?? "—"}</p>
                        <p className="text-slate-400 text-xs mt-0.5">STAR</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-indigo-400">{q.content_score ?? "—"}</p>
                        <p className="text-slate-400 text-xs mt-0.5">Content</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-indigo-400">{q.relevance_score ?? "—"}</p>
                        <p className="text-slate-400 text-xs mt-0.5">Relevance</p>
                      </div>
                      {isJD && (
                        <div className="text-center">
                          <p className="text-lg font-bold text-indigo-400">{q.jd_alignment_score ?? "—"}</p>
                          <p className="text-slate-400 text-xs mt-0.5">JD Align</p>
                        </div>
                      )}
                    </div>

                    {/* Composite */}
                    <div className="bg-slate-700/50 rounded-lg px-4 py-2 mb-4 flex items-center justify-between">
                      <p className="text-slate-400 text-xs">Composite</p>
                      <p className="text-white font-semibold text-sm">{q.composite_score ?? "—"} / 10</p>
                    </div>

                    {/* Written feedback */}
                    {q.written_feedback && (
                      <p className="text-slate-300 text-sm leading-relaxed mb-4">{q.written_feedback}</p>
                    )}

                    {/* Audio metrics footer */}
                    <div className="border-t border-slate-700 pt-3 grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-white font-semibold text-sm">
                          {q.filler_word_count ?? "—"}
                        </p>
                        <p className="text-slate-400 text-xs mt-0.5">Filler words</p>
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">
                          {q.words_per_minute ?? "—"}
                        </p>
                        <p className="text-slate-400 text-xs mt-0.5">WPM</p>
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm">
                          {q.answer_duration_seconds != null ? formatTime(q.answer_duration_seconds) : "—"} / 2:00
                        </p>
                        <p className="text-slate-400 text-xs mt-0.5">Time used</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Start New Session */}
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
