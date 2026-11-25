import { useEffect, useState } from "react";

export default function App() {
  const [health, setHealth] = useState<string>("checking…");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setHealth(d.ok ? "API connected" : "API error"))
      .catch(() => setHealth("API unreachable"));
  }, []);

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Photo upload</h1>
        <p className="text-gray-600">
          Upload your photos. Each one is checked automatically, then sorted into accepted or rejected.
        </p>
      </header>

      <p className="text-sm text-gray-500">{health}</p>
    </main>
  );
}
