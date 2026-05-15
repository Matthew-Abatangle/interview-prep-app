import { useState } from "react";

const ROWS = [
  { label: "Sessions per day",        free: "3",            pro: "Unlimited" },
  { label: "Full debrief + AI scoring", free: "✅",          pro: "✅" },
  { label: "Audio metrics",           free: "✅",            pro: "✅" },
  { label: "Session history",         free: "Last 3",       pro: "Full history" },
  { label: "Weakness tracking",       free: "—",            pro: "✅ Coming soon" },
  { label: "PDF export",              free: "—",            pro: "✅ Coming soon" },
  { label: "Eye contact scoring",     free: "—",            pro: "✅ Coming soon" },
];

export default function UpgradeModal({ isOpen, onDismiss }) {
  const [ctaClicked, setCtaClicked] = useState(false);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div className="bg-gray-800 rounded-2xl p-8 max-w-lg w-full mx-4 shadow-xl relative">

        {/* X button */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 transition-colors duration-150"
          aria-label="Close"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Headline */}
        <p className="text-indigo-400 text-sm font-medium mb-2">Session Complete</p>
        <h2 className="text-2xl font-bold text-white mb-1">You're putting in the work.</h2>
        <h2 className="text-2xl font-bold text-indigo-400 mb-6">Pro keeps up with you.</h2>

        {/* Tier comparison table */}
        <div className="rounded-xl overflow-hidden mb-6">
          {/* Header row */}
          <div className="grid grid-cols-3 bg-gray-700/50 py-2 px-4">
            <div />
            <div className="text-center text-sm font-medium text-gray-300">Free</div>
            <div className="text-center text-sm font-medium text-indigo-400">Pro</div>
          </div>

          {/* Data rows */}
          {ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`grid grid-cols-3 py-3 px-4 ${i % 2 === 0 ? "bg-transparent" : "bg-gray-700/50"}`}
            >
              <div className="text-sm text-white">{row.label}</div>
              <div className="text-center text-sm text-gray-300">{row.free}</div>
              <div className={`text-center text-sm ${row.pro === row.free ? "text-gray-300" : "text-indigo-400"}`}>
                {row.pro}
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={() => setCtaClicked(true)}
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-lg transition-colors duration-150 mt-6"
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
          onClick={onDismiss}
          className="text-gray-400 text-sm text-center mt-4 cursor-pointer hover:text-gray-300 transition-colors duration-150"
        >
          Continue with Free →
        </p>
      </div>
    </div>
  );
}
