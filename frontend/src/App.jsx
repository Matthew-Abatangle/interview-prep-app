import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import JobInputPage from "./pages/JobInputPage";
import QuestionsReadyPage from "./pages/QuestionsReadyPage";
import PermissionPage from "./pages/PermissionPage";
import PreInterviewPage from "./pages/PreInterviewPage";
import RecordingPage from "./pages/RecordingPage";
import DebriefPage from "./pages/DebriefPage";
import AccountHomePage from "./pages/AccountHomePage";
import SessionHistoryPage from "./pages/SessionHistoryPage";

function AppInner() {
  const { user, loading, signOut, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const [page, setPage] = useState("login");
  const [sessionData, setSessionData] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [debriefData, setDebriefData] = useState(null);
  const [viewingSession, setViewingSession] = useState(null);

  const handleSignOut = async () => {
    await signOut();
    setPage("login");
    setSessionData(null);
    setMediaStream(null);
    setDebriefData(null);
    setViewingSession(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    if (page === "reset_password") return <ResetPasswordPage onDone={() => setPage("login")} />;
    if (page === "signup") return <SignUpPage onNavigateToLogin={() => setPage("login")} />;
    if (page === "forgot_password") return <ForgotPasswordPage onNavigateToLogin={() => setPage("login")} />;
    return (
      <LoginPage
        onNavigateToSignUp={() => setPage("signup")}
        onForgotPassword={() => setPage("forgot_password")}
      />
    );
  }

  if (isPasswordRecovery) {
    return (
      <ResetPasswordPage
        onDone={() => {
          clearPasswordRecovery();
          setPage("login");
          signOut();
        }}
      />
    );
  }

  // Past session debrief view (read-only, from account home or session history)
  if (page === "past_debrief" && viewingSession) {
    return (
      <DebriefPage
        debriefData={viewingSession.debriefData}
        sessionSource={viewingSession.source}
        sessionQuestions={viewingSession.questions}
        onReset={() => {
          setViewingSession(null);
          setPage(viewingSession.returnTo || "account_home");
        }}
      />
    );
  }

  // Live debrief after completing a session
  if (page === "debrief" && debriefData) {
    return (
      <DebriefPage
        debriefData={debriefData}
        sessionSource={sessionData?.source}
        sessionQuestions={sessionData?.questions}
        onReset={() => {
          setDebriefData(null);
          setSessionData(null);
          setMediaStream(null);
          setPage("home");
        }}
        onGoToAccount={() => {
          setDebriefData(null);
          setSessionData(null);
          setMediaStream(null);
          setPage("account_home");
        }}
      />
    );
  }

  if (page === "recording" && sessionData && mediaStream) {
    return (
      <RecordingPage
        session_id={sessionData.session_id}
        questions={sessionData.questions}
        feedback_timing={sessionData.feedback_timing}
        mediaStream={mediaStream}
        onDebrief={(data) => {
          if (mediaStream) {
            mediaStream.getTracks().forEach((t) => t.stop());
            setMediaStream(null);
          }
          setDebriefData(data);
          setPage("debrief");
        }}
      />
    );
  }

  if (page === "pre_interview" && sessionData && mediaStream) {
    return (
      <PreInterviewPage
        session_id={sessionData.session_id}
        feedback_timing={sessionData.feedback_timing}
        mediaStream={mediaStream}
        onBegin={(finalTiming) => {
          setSessionData((prev) => ({ ...prev, feedback_timing: finalTiming }));
          setPage("recording");
        }}
      />
    );
  }

  if (page === "permissions" && sessionData) {
    return (
      <PermissionPage
        onGranted={(stream) => {
          setMediaStream(stream);
          setPage("pre_interview");
        }}
      />
    );
  }

  if (page === "questions_ready" && sessionData) {
    return (
      <QuestionsReadyPage
        sessionData={sessionData}
        onStartInterview={() => setPage("permissions")}
        onBack={() => {
          setSessionData(null);
          setPage("home");
        }}
      />
    );
  }

  if (page === "account_home") {
    return (
      <AccountHomePage
        onStartNew={() => setPage("home")}
        onSignOut={handleSignOut}
        onViewAll={() => setPage("session_history")}
        onViewSession={async (session) => {
          try {
            const { data: { session: authSession } } = await (await import("./lib/supabaseClient")).supabase.auth.getSession();
            const token = authSession?.access_token;
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions/${session.id}/detail`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              setViewingSession({
                debriefData: data,
                source: data.session_source,
                questions: data.session_questions,
                returnTo: "account_home",
              });
              setPage("past_debrief");
            }
          } catch {
            // silently fail for now — error states handled in next sprint
          }
        }}
      />
    );
  }

  if (page === "session_history") {
    return (
      <SessionHistoryPage
        onBack={() => setPage("account_home")}
        onViewSession={async (session) => {
          try {
            const { data: { session: authSession } } = await (await import("./lib/supabaseClient")).supabase.auth.getSession();
            const token = authSession?.access_token;
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/sessions/${session.id}/detail`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              const data = await res.json();
              setViewingSession({
                debriefData: data,
                source: data.session_source,
                questions: data.session_questions,
                returnTo: "session_history",
              });
              setPage("past_debrief");
            }
          } catch {
            // silently fail for now
          }
        }}
      />
    );
  }

  // Default authenticated view — JobInputPage
  return (
    <JobInputPage
      onSuccess={(data) => {
        setSessionData({ ...data, feedback_timing: "live" });
        setPage("questions_ready");
      }}
      onSignOut={handleSignOut}
      onGoToAccount={() => setPage("account_home")}
    />
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
