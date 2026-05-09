import { useState } from "react";
import JobInputPage from "./pages/JobInputPage";
import QuestionsReadyPage from "./pages/QuestionsReadyPage";

export default function App() {
  const [page, setPage] = useState("job_input");
  const [sessionData, setSessionData] = useState(null);

  function handleSuccess(data) {
    setSessionData(data);
    setPage("questions_ready");
  }

  function handleBack() {
    setPage("job_input");
    setSessionData(null);
  }

  if (page === "questions_ready") {
    return <QuestionsReadyPage sessionData={sessionData} onBack={handleBack} />;
  }

  return <JobInputPage onSuccess={handleSuccess} />;
}
