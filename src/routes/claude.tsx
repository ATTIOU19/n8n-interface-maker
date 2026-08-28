import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { askClaude, type ClaudeResult } from "@/lib/claude.functions";

export const Route = createFileRoute("/claude")({
  head: () => ({
    meta: [
      { title: "Assistant Claude — Poste d'Aiguillage" },
      {
        name: "description",
        content:
          "Console d'assistance basée sur l'API Anthropic Claude, appelée côté serveur avec une clé API sécurisée.",
      },
      { property: "og:title", content: "Assistant Claude — Poste d'Aiguillage" },
      {
        property: "og:description",
        content:
          "Interrogez Claude depuis la console : la clé API reste côté serveur, jamais exposée au navigateur.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClaudePage,
});

function ClaudePage() {
  const ask = useServerFn(askClaude);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ClaudeResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      setResult(await ask({ data: { prompt } }));
    } catch (err) {
      setResult({
        ok: false,
        code: "CLIENT_ERROR",
        error: err instanceof Error ? err.message : "Erreur inattendue.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-grid min-h-screen bg-background px-6 py-10 font-sans text-foreground">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Assistant Claude</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Les requêtes passent par une fonction serveur ; la clé ANTHROPIC_API_KEY n'est jamais
          envoyée au navigateur.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <textarea
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Posez votre question à Claude…"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            type="submit"
            disabled={loading || !prompt.trim()}
            className="rounded-lg bg-gradient-to-r from-primary to-primary-glow px-5 py-2.5 text-sm font-semibold text-primary-foreground glow-primary transition-all hover:brightness-110 disabled:opacity-60"
          >
            {loading ? "Interrogation…" : "Envoyer à Claude"}
          </button>
        </form>

        {result?.ok === true && (
          <div className="mt-8 rounded-md border border-border bg-card p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {result.model}
            </p>
            <p className="mt-2 text-sm whitespace-pre-wrap text-foreground">{result.text}</p>
          </div>
        )}

        {result?.ok === false && (
          <div className="mt-8 rounded-md border border-error/30 bg-error-muted p-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-error-foreground">
              {result.code}
            </p>
            <p className="mt-2 text-sm text-error-foreground">{result.error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
