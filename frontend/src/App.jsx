import { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import SignUpPage from "./pages/SignUpPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import JobInputPage from "./pages/JobInputPage";
import QuestionsReadyPage from "./pages/QuestionsReadyPage";

function AppInner() {
  const { user, loading, signOut, isPasswordRecovery, clearPasswordRecovery } = useAuth();
  const [page, setPage] = useState("login");
  const [sessionData, setSessionData] = useState(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    if (page === "reset_password") {
      return <ResetPasswordPage onDone={() => setPage("login")} />;
    }
    if (page === "signup") {
      return <SignUpPage onNavigateToLogin={() => setPage("login")} />;
    }
    if (page === "forgot_password") {
      return <ForgotPasswordPage onNavigateToLogin={() => setPage("login")} />;
    }
    return (
      <LoginPage
        onNavigateToSignUp={() => setPage("signup")}
        onForgotPassword={() => setPage("forgot_password")}
      />
    );
  }

  // User is authenticated
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

  if (page === "questions_ready" && sessionData) {
    return (
      <QuestionsReadyPage
        sessionData={sessionData}
        onBack={() => {
          setSessionData(null);
          setPage("home");
        }}
      />
    );
  }

  return (
    <JobInputPage
      onSuccess={(data) => {
        setSessionData(data);
        setPage("questions_ready");
      }}
      onSignOut={async () => {
        await signOut();
        setPage("login");
        setSessionData(null);
      }}
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
