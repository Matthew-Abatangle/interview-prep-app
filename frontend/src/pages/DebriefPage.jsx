import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

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

function AccordionItem({ q, index, isOpen, onToggle, isJD, questionMap }) {
  const meta = questionMap[q.id] ?? {};
  const arcLabel = ARC_LABELS[meta.arc_position] ?? meta.arc_position ?? "";

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-700/40 transition-colors duration-150"
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
            className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      <div
        className="transition-all duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: isOpen ? "600px" : "0px" }}
      >
        <div className="px-5 pb-5 border-t border-slate-700">
          <p className="text-slate-300 text-sm leading-relaxed mt-4 mb-5">
            {meta.question ?? `Question ${q.id}`}
          </p>

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

          {q.written_feedback && (
            <p className="text-slate-300 text-sm leading-relaxed mb-4">{q.written_feedback}</p>
          )}

          <div className="border-t border-slate-700 pt-3 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-white font-semibold text-sm">{q.filler_word_count ?? "—"}</p>
              <p className="text-slate-400 text-xs mt-0.5">Filler words</p>
            </div>
            <div>
              <p className="text-white font-semibold text-sm">{q.words_per_minute ?? "—"}</p>
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
      </div>
    </div>
  );
}

export default function DebriefPage({ debriefData, session_id, sessionSource, sessionQuestions, onReset, onGoToAccount, onGoToHistory }) {
  const [openIndex, setOpenIndex] = useState(null);
  const [localData, setLocalData] = useState(debriefData ?? null);
  const [fetchError, setFetchError] = useState(false);
  const [fetching, setFetching] = useState(false);

  async function fetchDebrief() {
    const sid = session_id || localData?.session_id;
    if (!sid) { setFetchError(true); return; }
    setFetching(true);
    setFetchError(false);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/debrief`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sid }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLocalData(data);
    } catch {
      setFetchError(true);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (!debriefData && session_id) {
      fetchDebrief();
    }
  }, []);

  if (fetching) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (fetchError || !localData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white gap-4">
        <p className="text-lg font-medium">Something went wrong on our end.</p>
        <p className="text-gray-400 text-sm">Your session is saved — give it another try.</p>
        <button
          onClick={fetchDebrief}
          className="mt-2 px-6 py-2 bg-indigo-600 rounded-lg text-white font-medium hover:bg-indigo-500"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { overall_score, dimension_averages, top_weaknesses, summary_text, questions } = localData;

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
    <div className="min-h-screen bg-gray-900 text-white px-4 py-12">
      <div className="w-full max-w-2xl mx-auto animate-fade-up">

        <h1 className="text-2xl font-bold text-white mb-8">Your Debrief</h1>

        <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 mb-6 flex flex-col items-center">
          <ScoreRing score={overall_score} />
          <p className="text-slate-400 text-sm mt-3">Overall Score</p>
        </div>

        <div className={`grid gap-4 mb-6 ${isJD ? "grid-cols-4" : "grid-cols-3"}`}>
          {dimensions.map((d) => (
            <DimensionCard key={d.label} label={d.label} score={d.score} />
          ))}
        </div>

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

        {summary_text && (
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-10">
            <h2 className="text-white font-semibold mb-3">Session Summary</h2>
            <p className="text-slate-300 text-sm leading-relaxed">{summary_text}</p>
          </div>
        )}

        <h2 className="text-lg font-semibold text-white mb-4">Question Breakdown</h2>
        <div className="space-y-3 mb-10">
          {questions?.map((q, i) => (
            <AccordionItem
              key={q.id ?? i}
              q={q}
              index={i}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? null : i)}
              isJD={isJD}
              questionMap={questionMap}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
          <button
            type="button"
            onClick={onReset}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-lg transition-colors duration-150"
          >
            Start New Session
          </button>
          {onGoToHistory && (
            <button
              type="button"
              onClick={onGoToHistory}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors duration-150"
            >
              All Sessions
            </button>
          )}
          {onGoToAccount && (
            <button
              type="button"
              onClick={onGoToAccount}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors duration-150"
            >
              Account Dashboard
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
