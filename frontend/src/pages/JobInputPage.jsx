import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

const PRESET_ROLES = [
  { value: "software-engineering-intern", label: "Software Engineering Intern" },
  { value: "data-science-intern", label: "Data Science / Analytics Intern" },
  { value: "investment-banking-intern", label: "Investment Banking Intern" },
  { value: "consulting-intern", label: "Consulting Intern" },
  { value: "product-management-intern", label: "Product Management Intern" },
  { value: "marketing-intern", label: "Marketing / Brand Intern" },
  { value: "finance-intern", label: "Finance / Corporate Finance Intern" },
];

function extractCompanyName(jd) {
  const sample = jd.slice(0, 300);
  const patterns = [
    /(?:at|join|About)\s+([A-Z][a-zA-Z0-9&\s]{1,30}?)(?:\s*[,.\n]|$)/m,
    /^([A-Z][a-zA-Z0-9&\s]{1,30}?)\s+is\s+(?:seeking|looking|hiring)/m,
  ];
  const generic = new Set(["we", "our", "the team", "the company", "us", "you"]);
  for (const pattern of patterns) {
    const match = pattern.exec(sample);
    if (match) {
      const name = match[1].trim();
      if (!generic.has(name.toLowerCase()) && name.length > 1) return name;
    }
  }
  return null;
}

export default function JobInputPage({ onSuccess, onSignOut }) {
  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [presetRole, setPresetRole] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const jdActive = jobDescription.replace(/\s/g, "").length >= 50;
  const jdNonEmpty = jobDescription.trim().length > 0;
  const presetActive = Boolean(presetRole);
  const submitDisabled = !jobTitle.trim() || !jdActive || loading;

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitDisabled) return;

    setLoading(true);
    setError(null);

    const trimmedTitle = jobTitle.trim();
    const trimmedJD = jobDescription.trim();
    const companyName = extractCompanyName(trimmedJD);

    try {
      // Get JWT token
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      const authHeader = { Authorization: `Bearer ${token}` };

      // Step 1: Create session via POST /api/sessions
      const sessionRes = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ job_title: trimmedTitle, source: "jd" }),
      });

      if (sessionRes.status === 429) {
        setError("You've reached your daily limit of 3 sessions. Come back tomorrow.");
        setLoading(false);
        return;
      }

      if (!sessionRes.ok) {
        setError("Something went wrong starting your session. Please try again.");
        setLoading(false);
        return;
      }

      const { session_id } = await sessionRes.json();

      // Step 2: Generate questions
      const body = {
        job_title: trimmedTitle,
        job_description: trimmedJD,
        session_id,
      };
      if (companyName) body.company_name = companyName;

      const questionsRes = await fetch(`${import.meta.env.VITE_API_URL}/api/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify(body),
      });

      if (questionsRes.ok) {
        const data = await questionsRes.json();
        onSuccess({
          session_id: data.session_id,
          questions: data.questions,
          source: data.source,
        });
      } else {
        setError("We had trouble generating questions. Please try again or adjust your job description.");
      }
    } catch {
      setError("We had trouble generating questions. Please try again or adjust your job description.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-2xl animate-fade-up">
        {/* Header */}
        <div className="relative mb-10 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Prepare for Your Interview</h1>
          <p className="text-gray-400 text-base">
            Enter your job details to generate personalized behavioral questions.
          </p>
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="absolute top-0 right-0 text-slate-400 hover:text-white text-sm transition-colors duration-150"
            >
              Sign out
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Job Title */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Job Title
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Investment Banking Analyst"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* JD Path — Primary */}
          <div className={presetActive ? "opacity-40 pointer-events-none" : ""}>
            <div className="rounded-xl border border-indigo-500 bg-gray-800 p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-white">Paste a Job Description</h2>
                  <span className="text-xs bg-indigo-600 text-white px-2 py-0.5 rounded-full font-medium">
                    Recommended
                  </span>
                </div>
                {jdNonEmpty && !presetActive && (
                  <button
                    type="button"
                    onClick={() => setJobDescription("")}
                    className="text-xs text-gray-400 hover:text-white transition-colors duration-150"
                  >
                    Clear
                  </button>
                )}
              </div>
              <textarea
                placeholder="Paste the full job description here..."
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={7}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-y"
                style={{ minHeight: "160px" }}
              />
              <p className="text-xs text-gray-400 mt-2">
                Questions will be tailored specifically to this role and company.
              </p>
            </div>
          </div>

          {/* Preset Path — Secondary */}
          <div className={jdNonEmpty ? "opacity-40 pointer-events-none" : ""}>
            <div className="rounded-xl border border-gray-700 bg-gray-800 p-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="text-sm font-medium text-gray-400">Use Preset Questions</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Choose from a curated set of questions for common roles.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs bg-gray-700 text-gray-400 px-2 py-0.5 rounded-full font-medium">
                    Coming Soon
                  </span>
                  {presetActive && !jdNonEmpty && (
                    <button
                      type="button"
                      onClick={() => setPresetRole("")}
                      className="text-xs text-gray-400 hover:text-white transition-colors duration-150"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              <select
                value={presetRole}
                onChange={(e) => setPresetRole(e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-400 focus:outline-none"
              >
                <option value="" disabled>Select a role...</option>
                {PRESET_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          {/* JD Submit */}
          <button
            type="submit"
            disabled={submitDisabled}
            className={`w-full font-semibold py-3 rounded-lg transition-all duration-150 ${
              submitDisabled
                ? "bg-indigo-800 text-indigo-400 cursor-not-allowed opacity-50"
                : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
            }`}
          >
            {loading ? "Generating..." : "Generate My Questions"}
          </button>
        </form>
      </div>
    </div>
  );
}
