import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function PreInterviewPage({ session_id, feedback_timing, mediaStream, onBegin }) {
  const videoRef = useRef(null);
  const [selectedTiming, setSelectedTiming] = useState(feedback_timing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
    }
  }, [mediaStream]);

  async function handleBegin() {
    setLoading(true);
    setError(null);

    let finalTiming = feedback_timing;

    if (selectedTiming !== feedback_timing) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;

        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions/${session_id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ feedback_timing: selectedTiming }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.detail || "Failed to save your preference. Please try again.");
          setLoading(false);
          return;
        }

        finalTiming = selectedTiming;
      } catch {
        setError("Failed to save your preference. Please try again.");
        setLoading(false);
        return;
      }
    }

    onBegin(finalTiming);
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-2xl animate-fade-up">
        <h1 className="text-3xl font-bold text-white mb-2">Ready to Begin?</h1>
        <p className="text-slate-400 text-base mb-8">
          Check your camera and choose how you'd like to receive feedback.
        </p>

        {/* Live camera preview */}
        <div className="rounded-xl overflow-hidden bg-slate-800 border border-slate-700 mb-8 aspect-video">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        </div>

        {/* Feedback timing toggle */}
        <div className="mb-8">
          <p className="text-sm font-medium text-slate-300 mb-3">Feedback timing</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setSelectedTiming("live")}
              className={`rounded-xl border p-4 text-left transition-all duration-150 ${
                selectedTiming === "live"
                  ? "border-indigo-500 bg-indigo-900/30"
                  : "border-slate-700 bg-slate-800 hover:border-slate-500"
              }`}
            >
              <p className="font-semibold text-white text-sm mb-1">Live feedback</p>
              <p className="text-slate-400 text-xs">See a feedback card after each question.</p>
            </button>
            <button
              type="button"
              onClick={() => setSelectedTiming("end_only")}
              className={`rounded-xl border p-4 text-left transition-all duration-150 ${
                selectedTiming === "end_only"
                  ? "border-indigo-500 bg-indigo-900/30"
                  : "border-slate-700 bg-slate-800 hover:border-slate-500"
              }`}
            >
              <p className="font-semibold text-white text-sm mb-1">Feedback at end</p>
              <p className="text-slate-400 text-xs">Skip cards — see everything in the final debrief.</p>
            </button>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        <button
          type="button"
          onClick={handleBegin}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Starting…" : "Begin Interview"}
        </button>
      </div>
    </div>
  );
}
