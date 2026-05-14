import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

function SessionRow({ session, onClick }) {
  const date = session.completed_at
    ? new Date(session.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
  const score = session.overall_score != null ? session.overall_score.toFixed(1) : "—";

  return (
    <button
      onClick={() => onClick(session)}
      className="w-full text-left bg-gray-800 border border-gray-700 hover:border-indigo-500 rounded-xl px-5 py-4 flex items-center justify-between transition-colors duration-150 group"
    >
      <div>
        <div className="text-white font-medium text-sm group-hover:text-indigo-300 transition-colors duration-150">
          {session.job_title}{session.company_name ? ` — ${session.company_name}` : ""}
        </div>
        <div className="text-gray-500 text-xs mt-1">{date}</div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-indigo-400 font-bold text-lg">{score}</span>
        <span className="text-gray-600 text-sm">→</span>
      </div>
    </button>
  );
}

export default function SessionHistoryPage({ onViewSession, onBack }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const token = authSession?.access_token;
        const headers = { Authorization: `Bearer ${token}` };
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions`, { headers });
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
        } else {
          setError("Failed to load sessions.");
        }
      } catch {
        setError("Failed to load sessions.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-2xl animate-fade-up space-y-6">

        <div className="relative flex items-center justify-center">
          <button
            onClick={onBack}
            className="absolute left-0 text-gray-400 hover:text-white text-sm transition-colors duration-150"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-white">All Sessions</h1>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <p className="text-white font-medium">We couldn't load your sessions.</p>
            <p className="text-gray-400 text-sm">Try refreshing the page.</p>
          </div>
        )}

        {!loading && !error && sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <p className="text-xl font-semibold text-white">No sessions yet.</p>
            <p className="text-gray-400 text-sm">Complete your first interview to see it here.</p>
          </div>
        )}

        {!loading && !error && sessions.length > 0 && (
          <div className="space-y-3">
            {sessions.map(s => (
              <SessionRow key={s.id} session={s} onClick={onViewSession} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
