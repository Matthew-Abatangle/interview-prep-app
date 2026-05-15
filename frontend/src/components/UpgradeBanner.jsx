export default function UpgradeBanner({ onUpgradeClick, onDismiss }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-800 border-t border-gray-700 px-6 py-3 flex items-center justify-between">
      <p className="text-sm text-gray-300">
        Upgrade to <span className="text-indigo-400 font-medium">Pro</span> — unlock 15 sessions/day and more.
      </p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onUpgradeClick}
          className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors duration-150"
        >
          Upgrade — $4.99/mo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-300 transition-colors duration-150"
          aria-label="Dismiss"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
