import { useState } from "react";

export default function PermissionPage({ onGranted }) {
  const [status, setStatus] = useState("idle"); // idle | requesting | denied

  async function requestPermissions() {
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      onGranted(stream);
    } catch {
      setStatus("denied");
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-up text-center">
        <div className="text-5xl mb-6">🎙️</div>
        <h1 className="text-3xl font-bold text-white mb-4">Camera & Mic Access</h1>
        <p className="text-slate-400 text-base mb-8">
          To run your interview session, we need access to your camera and microphone.
          Your video is never stored — it's analyzed in memory and discarded after each question.
        </p>

        {status === "denied" ? (
          <>
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-5 mb-6 text-left">
              <p className="text-red-400 font-semibold mb-2">Access was denied</p>
              <p className="text-slate-400 text-sm">
                To continue, open your browser settings, find the permissions for this site, and
                allow camera and microphone access. Then click Try Again below.
              </p>
            </div>
            <button
              type="button"
              onClick={requestPermissions}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-all duration-150"
            >
              Try Again
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={requestPermissions}
            disabled={status === "requesting"}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {status === "requesting" ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Requesting access…
              </>
            ) : (
              "Allow Camera & Mic"
            )}
          </button>
        )}
      </div>
    </div>
  );
}
