import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";

export default function PreInterviewPage({ session_id, feedback_timing, mediaStream, onBegin }) {
  const videoRef = useRef(null);
  const [selectedTiming, setSelectedTiming] = useState(feedback_timing);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const [volume, setVolume] = useState(0); // 0–100
  const [micSilent, setMicSilent] = useState(false);
  const silenceTimerRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
    }
  }, [mediaStream]);

  useEffect(() => {
    if (!mediaStream) return;

    const audioCtx = new AudioContext();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    const source = audioCtx.createMediaStreamSource(mediaStream);
    source.connect(analyser);
    audioContextRef.current = audioCtx;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function tick() {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      const scaled = Math.min(100, Math.round((avg / 128) * 100));
      setVolume(scaled);

      if (scaled < 3) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => setMicSilent(true), 2500);
        }
      } else {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
        setMicSilent(false);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      clearTimeout(silenceTimerRef.current);
      audioCtx.close();
    };
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
    <div className="min-h-screen bg-gray-900 text-white flex items-start justify-center px-4 py-12">
      <div className="w-full max-w-2xl animate-fade-up">
        <h1 className="text-3xl font-bold text-white mb-2">Ready to Begin?</h1>
        <p className="text-slate-400 text-base mb-8">
          Check your camera and choose how you'd like to receive feedback.
        </p>

        {/* Live camera preview */}
        <div className="rounded-xl overflow-hidden bg-slate-800 border border-slate-700 mb-3 aspect-video">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        </div>

        {/* Mic volume indicator */}
        <div className="flex items-center gap-3 mb-8 px-1">
          <svg
            className={`w-4 h-4 shrink-0 transition-colors duration-150 ${micSilent ? "text-red-400" : "text-slate-400"}`}
            fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
          </svg>
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-75"
              style={{
                width: `${volume}%`,
                backgroundColor: micSilent ? "#f87171" : volume > 60 ? "#34d399" : "#6366f1",
              }}
            />
          </div>
          {micSilent && (
            <span className="text-xs text-red-400 shrink-0">No audio detected</span>
          )}
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
