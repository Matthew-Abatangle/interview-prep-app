import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 text-center">
      <div className="text-3xl font-bold text-white mb-1">{value ?? "—"}</div>
      <div className="text-sm font-medium text-gray-300">{label}</div>
      {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}

function TrendGraph({ sessions }) {
  if (!sessions || sessions.length < 2) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 flex items-center justify-center min-h-[160px]">
        <p className="text-gray-500 text-sm">Complete at least 2 sessions to see your trend.</p>
      </div>
    );
  }

  const reversed = [...sessions].reverse();
  const width = 600;
  const height = 160;
  const padX = 32;
  const padY = 20;
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;

  function toPoints(data) {
    return data.map((v, i) => {
      const x = padX + (i / (data.length - 1)) * chartW;
      const y = padY + (1 - v / 10) * chartH;
      return [x, y];
    });
  }

  const overallScores = reversed.map(s => s.overall_score ?? 0);
  const starScores = reversed.map(s => s.star_avg ?? 0);

  function pointsToPath(pts) {
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  }

  const overallPts = toPoints(overallScores);
  const starPts = toPoints(starScores);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center gap-6 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-indigo-500" />
          <span className="text-xs text-gray-400">Overall Score</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-violet-400" />
          <span className="text-xs text-gray-400">STAR Structure</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height: "160px" }}>
        {[0, 2.5, 5, 7.5, 10].map(v => {
          const y = padY + (1 - v / 10) * chartH;
          return (
            <g key={v}>
              <line x1={padX} y1={y} x2={width - padX} y2={y} stroke="#374151" strokeWidth="1" />
              <text x={padX - 6} y={y + 4} textAnchor="end" fill="#6b7280" fontSize="10">{v}</text>
            </g>
          );
        })}
        <path d={pointsToPath(overallPts)} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={pointsToPath(starPts)} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {overallPts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" fill="#6366f1" />
        ))}
        {starPts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3" fill="#a78bfa" />
        ))}
      </svg>
    </div>
  );
}

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

export default function AccountHomePage({ onStartNew, onViewSession, onViewAll, onSignOut }) {
  const [sessions, setSessions] = useState([]);
  const [todayCount, setTodayCount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session: authSession } } = await supabase.auth.getSession();
        const token = authSession?.access_token;
        const headers = { Authorization: `Bearer ${token}` };
        const base = import.meta.env.VITE_API_URL;

        const [sessionsRes, countRes] = await Promise.all([
          fetch(`${base}/api/sessions`, { headers }),
          fetch(`${base}/api/sessions/today-count`, { headers }),
        ]);

        if (sessionsRes.ok) {
          const data = await sessionsRes.json();
          setSessions(data.sessions || []);
        }
        if (countRes.ok) {
          const data = await countRes.json();
          setTodayCount(data.count);
        }
      } catch {
        setError("Failed to load your sessions.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const totalSessions = sessions.length;
  const avgScore = totalSessions > 0
    ? (sessions.reduce((sum, s) => sum + (s.overall_score ?? 0), 0) / totalSessions).toFixed(1)
    : null;
  const recent3 = sessions.slice(0, 3);
  const hasMore = sessions.length > 3;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Sticky nav bar */}
      <div className="sticky top-0 z-50 h-14 bg-gray-900 px-6 flex items-center justify-between">
        <span className="text-sm font-semibold text-white">Interview Prep</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onStartNew}
            className="text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg transition-colors duration-150"
          >
            New Session
          </button>
          <button
            onClick={onSignOut}
            className="text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white px-4 py-1.5 rounded-lg transition-colors duration-150"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-2xl animate-fade-up space-y-8">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-white mb-1">Your Dashboard</h1>
          <p className="text-gray-400 text-sm">Track your progress and review past sessions.</p>
        </div>

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <p className="text-white font-medium">We couldn't load your dashboard.</p>
            <p className="text-gray-400 text-sm">Try refreshing the page.</p>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Stat cards — always shown */}
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Sessions Completed" value={totalSessions} />
              <StatCard label="Average Score" value={avgScore} sub="out of 10" />
              <StatCard
                label="Sessions Today"
                value={todayCount != null ? `${todayCount} of 3` : "—"}
                sub={todayCount >= 3 ? "Daily limit reached" : `${3 - (todayCount ?? 0)} remaining`}
              />
            </div>

            {/* Empty state — replaces graph + session list */}
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <p className="text-xl font-semibold text-white">No sessions yet.</p>
                <p className="text-gray-400 text-sm">Start your first interview to see your progress here.</p>
                <button
                  onClick={onStartNew}
                  className="mt-2 px-6 py-2 bg-indigo-600 rounded-lg text-white font-medium hover:bg-indigo-500"
                >
                  Start Your First Interview
                </button>
              </div>
            ) : (
              <>
                {/* Trend graph */}
                <TrendGraph sessions={sessions} />

                {/* Recent sessions */}
                <div>
                  <h2 className="text-base font-semibold text-white text-center mb-3">Recent Sessions</h2>
                  <div className="space-y-3">
                    {recent3.map(s => (
                      <SessionRow key={s.id} session={s} onClick={onViewSession} />
                    ))}
                  </div>
                  {hasMore && (
                    <div className="text-center mt-4">
                      <button
                        onClick={onViewAll}
                        className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors duration-150"
                      >
                        View all sessions →
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
      </div>
    </div>
  );
}
