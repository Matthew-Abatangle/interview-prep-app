import { useEffect, useState } from "react";

export default function App() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/health`)
      .then((res) => {
        if (res.ok) setStatus("connected");
        else setStatus("unreachable");
      })
      .catch(() => setStatus("unreachable"));
  }, []);

  return (
    <div>
      {status === "checking" && <p>Checking backend...</p>}
      {status === "connected" && <p>Backend connected ✓</p>}
      {status === "unreachable" && <p>Backend unreachable ✗</p>}
    </div>
  );
}
