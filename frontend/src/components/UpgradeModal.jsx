import { useState } from "react";

const ROWS = [
  { label: "Sessions per day",          free: "3",          pro: "Unlimited" },
  { label: "Full debrief + AI scoring", free: "check",      pro: "check" },
  { label: "Audio metrics",             free: "check",      pro: "check" },
  { label: "Session history",           free: "Last 3",     pro: "Full history" },
  { label: "Weakness tracking",         free: "—",          pro: "soon" },
  { label: "PDF export",                free: "—",          pro: "soon" },
  { label: "Eye contact scoring",       free: "—",          pro: "soon" },
];

function CheckIcon({ color }) {
  return (
    <svg
      className={`w-4 h-4 inline ${color}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function CellValue({ value, isProCol }) {
  if (value === "check") {
    return <CheckIcon color={isProCol ? "text-indigo-400" : "text-gray-400"} />;
  }
  if (value === "soon") {
    return <span className="text-gray-500 text-xs">Coming soon</span>;
  }
  // Text values: pro column gets indigo when it differs from free
  return <span>{value}</span>;
}

export default function UpgradeModal({ isOpen, onDismissX, onDismissContinue }) {
  const [ctaClicked, setCtaClicked] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onDismissX(); }}
    >
      <div className="bg-gray-800 rounded-2xl p-6 max-w-lg w-full mx-4 shadow-xl relative">

        {/* X button */}
        <button
          type="button"
          onClick={onDismissX}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition-colors duration-150"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Headline */}
        <h2 className="text-xl font-bold text-white mb-4">
          You're putting in the work, Pro keeps up with you.
        </h2>

        {/* Tier comparison table */}
        <div className="rounded-xl overflow-hidden mb-4">
          {/* Header row */}
          <div className="grid grid-cols-3 bg-gray-700/50 py-2 px-4">
            <div />
            <div className="text-center text-xs font-medium text-gray-300">Free</div>
            <div className="text-center text-xs font-medium text-indigo-400">Pro</div>
          </div>

          {/* Data rows */}
          {ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-3 py-2 px-4 ${i % 2 === 0 ? "bg-transparent" : "bg-gray-700/50"}`}
            >
              <div className="text-xs text-white">{row.label}</div>
              <div className="text-center text-xs text-gray-300">
                <CellValue value={row.free} isProCol={false} />
              </div>
              <div className={`text-center text-xs ${row.pro !== row.free && row.pro !== "check" && row.pro !== "soon" ? "text-indigo-400" : "text-gray-300"}`}>
                <CellValue value={row.pro} isProCol={true} />
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => setCtaClicked(true)}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-colors duration-150 mt-2"
        >
          Get Pro — $7.99/month
        </button>
        <p className="text-gray-400 text-xs text-center mt-1">or $64/year — save 33%</p>
        {ctaClicked && (
          <p className="text-indigo-300 text-sm text-center mt-2">
            Coming soon — we'll notify you when Pro launches.
          </p>
        )}

        {/* Dismiss link */}
        <p
          onClick={onDismissContinue}
          className="text-gray-400 text-sm text-center mt-4 cursor-pointer hover:text-gray-300 transition-colors duration-150"
        >
          Continue with Free →
        </p>
      </div>
    </div>
  );
}
