import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function RecordingPage({ session_id, questions, feedback_timing, mediaStream, onDebrief }) {
  const [phase, setPhase] = useState("prep"); // prep | recording | processing | feedback | debrief_trigger
  const [qIndex, setQIndex] = useState(0);
  const [prepSeconds, setPrepSeconds] = useState(60);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [metrics, setMetrics] = useState(Array(5).fill(null));
  const [blobUrl, setBlobUrl] = useState(null);
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0); // 0–100
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [debriefError, setDebriefError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const prepIntervalRef = useRef(null);
  const prepTimeoutRef = useRef(null);
  const recordIntervalRef = useRef(null);
  const recordTimeoutRef = useRef(null);
  const recordSecondsRef = useRef(0);
  const blobUrlRef = useRef(null);
  const phaseRef = useRef("prep");
  const isStoppingRef = useRef(false);
  const liveVideoRef = useRef(null);
  const playbackVideoRef = useRef(null);

  function setPhaseWithRef(newPhase) {
    phaseRef.current = newPhase;
    setPhase(newPhase);
  }

  // Prep phase setup
  useEffect(() => {
    if (phase !== "prep") return;

    isStoppingRef.current = false;
    setPrepSeconds(60);

    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = mediaStream;
    }

    const interval = setInterval(() => {
      setPrepSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    prepIntervalRef.current = interval;

    const timeout = setTimeout(() => {
      if (phaseRef.current === "prep") {
        setPhaseWithRef("recording");
      }
    }, 60000);
    prepTimeoutRef.current = timeout;

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [phase, qIndex, mediaStream]);

  // Recording phase setup
  useEffect(() => {
    if (phase !== "recording") return;

    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = mediaStream;
    }

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    const mr = new MediaRecorder(mediaStream, { mimeType });
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    mr.start(250);
    mediaRecorderRef.current = mr;

    recordSecondsRef.current = 0;
    setRecordSeconds(0);

    const interval = setInterval(() => {
      recordSecondsRef.current += 1;
      setRecordSeconds(recordSecondsRef.current);
    }, 1000);
    recordIntervalRef.current = interval;

    const timeout = setTimeout(() => {
      if (phaseRef.current === "recording") {
        handleStopRecording();
      }
    }, 120000);
    recordTimeoutRef.current = timeout;

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [phase, mediaStream]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debrief trigger
  useEffect(() => {
    if (phase !== "debrief_trigger") return;
    triggerDebrief();
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(prepIntervalRef.current);
      clearTimeout(prepTimeoutRef.current);
      clearInterval(recordIntervalRef.current);
      clearTimeout(recordTimeoutRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  function handleStartRecordingEarly() {
    clearInterval(prepIntervalRef.current);
    clearTimeout(prepTimeoutRef.current);
    setPhaseWithRef("recording");
  }

  function handleStopRecording() {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    clearInterval(recordIntervalRef.current);
    clearTimeout(recordTimeoutRef.current);

    const duration = recordSecondsRef.current;
    const mr = mediaRecorderRef.current;

    setPhaseWithRef("processing");

    if (mr && mr.state !== "inactive") {
      mr.onstop = () => processRecording(duration);
      mr.stop();
    } else {
      processRecording(duration);
    }
  }

  async function processRecording(duration) {
    const blob = new Blob(chunksRef.current, { type: "video/webm" });

    if (feedback_timing === "live") {
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setBlobUrl(url);
    }

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const formData = new FormData();
    formData.append("audio", blob, "answer.webm");
    formData.append("session_id", session_id);
    formData.append("question_id", String(qIndex + 1));

    let questionMetrics = null;
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        questionMetrics = {
          filler_word_count: data.filler_word_count,
          words_per_minute: data.words_per_minute,
          answer_duration_seconds: data.answer_duration_seconds,
        };
      } else {
        console.error("[transcribe] Non-OK response:", res.status);
        questionMetrics = { filler_word_count: null, words_per_minute: null, answer_duration_seconds: duration };
      }
    } catch (err) {
      console.error("[transcribe] Request failed:", err);
      questionMetrics = { filler_word_count: null, words_per_minute: null, answer_duration_seconds: duration };
    }

    setMetrics((prev) => {
      const updated = [...prev];
      updated[qIndex] = questionMetrics;
      return updated;
    });

    if (feedback_timing === "live") {
      setPhaseWithRef("feedback");
    } else {
      advanceQuestion();
    }
  }

  function advanceQuestion() {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
      setBlobUrl(null);
    }

    setIsPlaying(false);
    setVideoProgress(0);
    setVideoCurrentTime(0);
    setVideoDuration(0);

    if (qIndex >= 4) {
      setPhaseWithRef("debrief_trigger");
    } else {
      setQIndex((i) => i + 1);
      setPhaseWithRef("prep");
    }
  }

  async function triggerDebrief() {
    setDebriefError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/debrief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ session_id }),
      });

      if (res.ok) {
        const data = await res.json();
        onDebrief(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setDebriefError(err.detail || "Failed to generate your debrief.");
      }
    } catch {
      setDebriefError("Failed to generate your debrief. Please try again.");
    }
  }

  const currentQuestion = questions[qIndex];

  // ── PREP ────────────────────────────────────────────────────────────────────
  if (phase === "prep") {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-start justify-center px-4 py-12">
        <div className={`w-full max-w-2xl ${qIndex === 0 ? "animate-fade-up" : ""}`}>
          <div className="flex items-center justify-between mb-6">
            <p className="text-slate-400 text-sm">Question {qIndex + 1} of 5</p>
            <p className="text-indigo-400 font-semibold text-sm">Prep — {prepSeconds}s</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
            <p className="text-white text-lg leading-relaxed">{currentQuestion.question}</p>
          </div>

          <div className="rounded-xl overflow-hidden bg-slate-800 border border-slate-700 mb-6 aspect-video">
            <video ref={liveVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          </div>

          <button
            type="button"
            onClick={handleStartRecordingEarly}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-all duration-150"
          >
            Start Recording Early
          </button>
        </div>
      </div>
    );
  }

  // ── RECORDING ────────────────────────────────────────────────────────────────
  if (phase === "recording") {
    const progress = Math.min((recordSeconds / 120) * 100, 100);
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="flex items-center justify-between mb-6">
            <p className="text-slate-400 text-sm">Question {qIndex + 1} of 5</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <p className="text-red-400 font-semibold text-sm">Recording</p>
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
            <p className="text-white text-lg leading-relaxed">{currentQuestion.question}</p>
          </div>

          <div className="rounded-xl overflow-hidden bg-slate-800 border border-slate-700 mb-4 aspect-video">
            <video ref={liveVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
          </div>

          <div className="mb-1">
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-indigo-500 h-2 rounded-full transition-all duration-1000"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="flex justify-between text-xs text-slate-400 mb-6">
            <span>{formatTime(recordSeconds)}</span>
            <span>2:00</span>
          </div>

          <button
            type="button"
            onClick={handleStopRecording}
            className="w-full bg-red-600 hover:bg-red-500 text-white font-semibold py-3 rounded-lg transition-all duration-150"
          >
            Stop Recording
          </button>
        </div>
      </div>
    );
  }

  // ── PROCESSING ───────────────────────────────────────────────────────────────
  if (phase === "processing") {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <p className="text-white font-semibold text-lg mb-2">Analyzing your answer…</p>
          <p className="text-slate-400 text-sm">This may take up to 30 seconds.</p>
        </div>
      </div>
    );
  }

  // ── FEEDBACK ─────────────────────────────────────────────────────────────────
  if (phase === "feedback") {
    const m = metrics[qIndex];
    const isLastQuestion = qIndex >= 4;
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <p className="text-slate-400 text-sm mb-6">Question {qIndex + 1} of 5 — Feedback</p>

          {blobUrl && (
            <div className="rounded-xl overflow-hidden bg-black mb-6">
              <div className="aspect-video">
                <video
                  ref={playbackVideoRef}
                  src={blobUrl}
                  muted={isMuted}
                  playsInline
                  className="w-full h-full object-cover"
                  onLoadedMetadata={() => {
                    const vid = playbackVideoRef.current;
                    if (vid) {
                      setVideoDuration(vid.duration);
                      vid.play().then(() => setIsPlaying(true)).catch(() => {});
                    }
                  }}
                  onTimeUpdate={() => {
                    const vid = playbackVideoRef.current;
                    if (vid && vid.duration) {
                      setVideoCurrentTime(vid.currentTime);
                      setVideoProgress((vid.currentTime / vid.duration) * 100);
                    }
                  }}
                  onEnded={() => setIsPlaying(false)}
                />
              </div>

              {/* Custom controls bar */}
              <div className="bg-slate-900 px-4 py-3 flex items-center gap-3">
                {/* Play/Pause */}
                <button
                  type="button"
                  onClick={() => {
                    const vid = playbackVideoRef.current;
                    if (!vid) return;
                    if (vid.paused) {
                      vid.play().then(() => setIsPlaying(true)).catch(() => {});
                    } else {
                      vid.pause();
                      setIsPlaying(false);
                    }
                  }}
                  className="text-white hover:text-indigo-400 transition-colors flex-shrink-0"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M5 3.868v16.264c0 .858.97 1.348 1.671.847l12.5-8.132a1 1 0 0 0 0-1.694l-12.5-8.132C6.97 2.52 5 3.01 5 3.868z" />
                    </svg>
                  )}
                </button>

                {/* Time display */}
                <span className="text-slate-400 text-xs font-mono flex-shrink-0 w-20">
                  {formatTime(Math.floor(videoCurrentTime))} / {formatTime(Math.floor(videoDuration))}
                </span>

                {/* Scrubber */}
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="0.1"
                  value={videoProgress}
                  onChange={(e) => {
                    const vid = playbackVideoRef.current;
                    if (!vid || !vid.duration) return;
                    const newTime = (parseFloat(e.target.value) / 100) * vid.duration;
                    vid.currentTime = newTime;
                    setVideoProgress(parseFloat(e.target.value));
                    setVideoCurrentTime(newTime);
                  }}
                  className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-500 bg-slate-700"
                />

                {/* Mute toggle */}
                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  className="text-slate-400 hover:text-white transition-colors flex-shrink-0"
                  aria-label={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13 3.586a1 1 0 0 0-1.707-.707L6.586 7.5H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3.586l4.707 4.621A1 1 0 0 0 13 20.414V3.586zM17.07 8.344a1 1 0 1 0-1.414 1.414 4 4 0 0 1 0 4.485 1 1 0 1 0 1.414 1.414 6 6 0 0 0 0-7.313z" />
                      <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13 3.586a1 1 0 0 0-1.707-.707L6.586 7.5H3a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3.586l4.707 4.621A1 1 0 0 0 13 20.414V3.586zM17.07 8.344a1 1 0 1 0-1.414 1.414 4 4 0 0 1 0 4.485 1 1 0 1 0 1.414 1.414 6 6 0 0 0 0-7.313z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 mb-6">
            <h3 className="text-white font-semibold mb-4">Quick Feedback</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-indigo-400">
                  {m?.filler_word_count != null ? m.filler_word_count : "—"}
                </p>
                <p className="text-slate-400 text-xs mt-1">Filler words</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-indigo-400">
                  {m?.words_per_minute != null ? m.words_per_minute : "—"}
                </p>
                <p className="text-slate-400 text-xs mt-1">WPM</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-indigo-400">
                  {m?.answer_duration_seconds != null ? formatTime(m.answer_duration_seconds) : "—"} / 2:00
                </p>
                <p className="text-slate-400 text-xs mt-1">Time used</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={advanceQuestion}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-all duration-150"
          >
            {isLastQuestion ? "See Your Results" : "Next Question"}
          </button>
        </div>
      </div>
    );
  }

  // ── DEBRIEF TRIGGER ──────────────────────────────────────────────────────────
  if (phase === "debrief_trigger") {
    if (debriefError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <p className="text-red-400 font-medium mb-6">{debriefError}</p>
            <button
              type="button"
              onClick={triggerDebrief}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 px-8 rounded-lg transition-all duration-150"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
          <p className="text-white font-semibold text-lg mb-2">Generating your debrief…</p>
          <p className="text-slate-400 text-sm">This may take up to 60 seconds.</p>
        </div>
      </div>
    );
  }

  return null;
}
