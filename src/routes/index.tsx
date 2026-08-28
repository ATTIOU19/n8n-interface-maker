import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";

import { askClaude, type ClaudeResult } from "@/lib/claude.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Poste d'Aiguillage — Envoi vers workflow n8n / Make" },
      {
        name: "description",
        content:
          "Console d'envoi : saisissez une charge utile et transmettez-la instantanément à votre workflow d'automatisation n8n ou Make via webhook.",
      },
      { property: "og:title", content: "Poste d'Aiguillage — Envoi vers workflow n8n / Make" },
      {
        property: "og:description",
        content:
          "Formulaire et journal des transmissions pour piloter un workflow n8n ou Make depuis une interface unique.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Priorite = "Basse" | "Standard" | "Critique";

type LogEntry = {
  id: string;
  ref: string;
  ok: boolean;
  time: string;
  message: string;
  detail?: string;
  detailKind: "console" | "error" | "none";
};

const DEFAULT_WEBHOOK_URL = "https://ali19.app.n8n.cloud/webhook/lovable-form";
const STORAGE_KEY = "aiguillage.webhook.n8n.url";

function horodatage(d: Date) {
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(
    Math.floor(d.getMilliseconds() / 10),
  )}`;
}

function Index() {
  const ask = useServerFn(askClaude);

  const [webhookUrl, setWebhookUrl] = useState(DEFAULT_WEBHOOK_URL);
  const [editUrl, setEditUrl] = useState(false);
  const [connState, setConnState] = useState<"idle" | "testing" | "ok" | "ko">("idle");
  const [latency, setLatency] = useState<number | null>(null);

  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [sujet, setSujet] = useState("");
  const [contenu, setContenu] = useState("");
  const [priorite, setPriorite] = useState<Priorite>("Standard");
  const [envoi, setEnvoi] = useState(false);
  const [counter, setCounter] = useState(9480);

  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [questionClaude, setQuestionClaude] = useState("");
  const [claudeLoading, setClaudeLoading] = useState(false);
  const [claudeResult, setClaudeResult] = useState<ClaudeResult | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_WEBHOOK_URL;
    setWebhookUrl(saved);
    if (!saved) setEditUrl(true);
  }, []);

  useEffect(() => {
    if (webhookUrl) localStorage.setItem(STORAGE_KEY, webhookUrl);
  }, [webhookUrl]);

  const stats = useMemo(
    () => ({
      ok: logs.filter((l) => l.ok).length,
      ko: logs.filter((l) => !l.ok).length,
    }),
    [logs],
  );

  const urlCourte =
    webhookUrl.length > 38 ? `${webhookUrl.slice(0, 35)}...` : webhookUrl || "aucun webhook configuré";

  function pushLog(entry: Omit<LogEntry, "id" | "time">) {
    setLogs((prev) => [
      { ...entry, id: crypto.randomUUID(), time: horodatage(new Date()) },
      ...prev,
    ]);
  }

  async function testerConnexion() {
    if (!webhookUrl) {
      setEditUrl(true);
      return;
    }
    setConnState("testing");
    const t0 = performance.now();
    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ping", source: "poste-aiguillage" }),
      });
      const ms = Math.round(performance.now() - t0);
      setLatency(ms);
      setConnState(res.ok ? "ok" : "ko");
      pushLog({
        ref: res.ok ? "PING_SUCCESS" : "PING_ERROR",
        ok: res.ok,
        message: res.ok
          ? `Test de connexion réussi en ${ms}ms.`
          : `Le webhook a répondu avec le statut ${res.status}.`,
        detail: `{ "status": ${res.status}, "latency_ms": ${ms} }`,
        detailKind: res.ok ? "console" : "error",
      });
    } catch (err) {
      setConnState("ko");
      setLatency(null);
      pushLog({
        ref: "PING_ERROR",
        ok: false,
        message: "Échec du test : le webhook est injoignable (réseau ou CORS).",
        detail: err instanceof Error ? err.message : "ERR_NETWORK",
        detailKind: "error",
      });
    }
  }

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    if (!webhookUrl) {
      setEditUrl(true);
      return;
    }
    setEnvoi(true);
    const ref = counter + 1;
    setCounter(ref);
    const t0 = performance.now();
    const payload = {
      nom,
      email,
      sujet,
      message: contenu,
      priorite,
      source: "poste-aiguillage",
      envoye_le: new Date().toISOString(),
    };

    try {
      const res = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const ms = Math.round(performance.now() - t0);
      setLatency(ms);
      setConnState(res.ok ? "ok" : "ko");
      pushLog({
        ref: `TX_${ref}_${res.ok ? "SUCCESS" : "ERROR"}`,
        ok: res.ok,
        message: res.ok
          ? `Transmission de « ${sujet || "sans sujet"} » achevée en ${ms}ms.`
          : `Échec de l'aiguillage : le workflow a répondu ${res.status}.`,
        detail: `{ "status": ${res.status}, "priorite": "${priorite}", "routed": ${res.ok} }`,
        detailKind: res.ok ? "console" : "error",
      });
      if (res.ok) {
        setSujet("");
        setContenu("");
      }
    } catch (err) {
      setConnState("ko");
      pushLog({
        ref: `TX_${ref}_ERROR`,
        ok: false,
        message: "Échec de l'aiguillage : aucune réponse du serveur distant.",
        detail: err instanceof Error ? err.message : "ERR_CONNECTION_FAILED",
        detailKind: "error",
      });
    } finally {
      setEnvoi(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";
  const labelCls =
    "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground font-mono";

  return (
    <div className="bg-grid min-h-screen bg-background pb-10 font-sans text-foreground antialiased">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
              <svg
                className="size-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                />
              </svg>
            </div>
            <div>
              <h1 className="font-heading text-sm font-semibold tracking-tight">Poste d'Aiguillage Alpha</h1>
              <p className="font-mono text-xs text-muted-foreground">v2.4.0-stable</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 ring-1 ring-border">
              <span className="relative flex h-2 w-2">
                {connState !== "ko" && (
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                      connState === "ok" ? "bg-success" : "bg-warning"
                    }`}
                  />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${
                    connState === "ok" ? "bg-success" : connState === "ko" ? "bg-error" : "bg-warning"
                  }`}
                />
              </span>
              <span className="font-mono text-xs font-medium text-muted-foreground">
                {connState === "ok"
                  ? "WEBHOOK_ACTIVE"
                  : connState === "ko"
                    ? "WEBHOOK_DOWN"
                    : connState === "testing"
                      ? "WEBHOOK_TESTING"
                      : "WEBHOOK_IDLE"}
              </span>
              <span className="h-3 w-px bg-border" />
              {editUrl ? (
                <input
                  autoFocus
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  onBlur={() => webhookUrl && setEditUrl(false)}
                  placeholder="https://hook.eu2.make.com/..."
                  className="w-64 bg-transparent font-mono text-xs text-foreground focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditUrl(true)}
                  className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {urlCourte}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={testerConnexion}
              disabled={connState === "testing"}
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {connState === "testing" ? "Test en cours…" : "Tester la connexion"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-12 gap-0 border-x border-border bg-card">
        <section className="col-span-12 border-b border-border p-8 lg:col-span-5 lg:border-b-0 lg:border-r">
          <div className="mb-8">
            <h2 className="font-heading text-xl font-semibold tracking-tight text-balance">
              Bordereau d'expédition
            </h2>
            <p className="mt-2 max-w-[48ch] text-sm text-pretty text-muted-foreground">
              Saisissez les paramètres de la charge utile. Chaque envoi est routé instantanément vers
              le workflow d'automatisation configuré.
            </p>
          </div>

          <form className="space-y-6" onSubmit={envoyer}>
            <div className="space-y-2">
              <span className={labelCls}>Identité de l'expéditeur</span>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  required
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Nom complet"
                  className={inputCls}
                />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  className={inputCls}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className={labelCls} htmlFor="sujet">
                Objet du message
              </label>
              <input
                id="sujet"
                type="text"
                required
                value={sujet}
                onChange={(e) => setSujet(e.target.value)}
                placeholder="Sujet de la transmission"
                className={inputCls}
              />
            </div>

            <div className="space-y-2">
              <label className={labelCls} htmlFor="payload">
                Corps de la payload
              </label>
              <textarea
                id="payload"
                rows={4}
                value={contenu}
                onChange={(e) => setContenu(e.target.value)}
                placeholder="Contenu textuel..."
                className={inputCls}
              />
            </div>

            <div className="space-y-2">
              <span className={labelCls}>Priorité d'aiguillage</span>
              <div className="flex gap-2">
                {(["Basse", "Standard", "Critique"] as Priorite[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriorite(p)}
                    className={
                      priorite === p
                        ? "flex-1 rounded border-2 border-primary py-2 text-xs font-semibold"
                        : "flex-1 rounded border border-border py-2 text-xs font-medium hover:bg-muted"
                    }
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={envoi}
                className="flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-primary to-primary-glow py-2.5 pr-3 pl-2 text-sm font-semibold text-primary-foreground glow-primary ring-2 ring-ring/50 ring-offset-2 ring-offset-background transition-all hover:brightness-110 hover:glow-primary-strong focus:ring-2 active:scale-[0.98] disabled:opacity-60 disabled:shadow-none"
              >
                <svg
                  className="mr-2 size-4 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                  />
                </svg>
                {envoi ? "Envoi en cours…" : "Envoyer"}
              </button>
            </div>
          </form>
        </section>

        <section className="col-span-12 bg-background lg:col-span-7">
          <div className="sticky top-0 z-10 border-b border-border bg-background/80 p-4 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold tracking-tight">Journal des transmissions</h3>
              <div className="flex gap-2">
                <span className="rounded bg-success-muted px-2 py-0.5 text-[10px] font-medium text-success-foreground">
                  SUCCÈS : {stats.ok}
                </span>
                <span className="rounded bg-error-muted px-2 py-0.5 text-[10px] font-medium text-error-foreground">
                  ERREUR : {stats.ko}
                </span>
              </div>
            </div>
          </div>

          <div className="divide-y divide-border">
            {logs.map((log) => (
              <div
                key={log.id}
                className="group flex animate-in items-start gap-4 p-4 fade-in slide-in-from-top-1 hover:bg-muted/50"
              >
                <div className="mt-1 shrink-0">
                  <div
                    className={`h-2 w-2 rounded-full ${log.ok ? "bg-success" : "bg-error"}`}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-xs font-medium ${log.ok ? "" : "text-error-foreground"}`}
                    >
                      {log.ref}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">{log.time}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{log.message}</p>
                  {log.detail && log.detailKind === "console" && (
                    <div className="mt-2 rounded bg-console p-2">
                      <code className="block font-mono text-[11px] text-console-foreground">
                        {log.detail}
                      </code>
                    </div>
                  )}
                  {log.detail && log.detailKind === "error" && (
                    <div className="mt-2 rounded border border-error/30 bg-error-muted p-2">
                      <code className="block font-mono text-[11px] text-error-foreground">
                        {log.detail}
                      </code>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center p-8 text-center">
            <p className="font-mono text-[11px] text-muted-foreground">
              {logs.length === 0
                ? "AUCUNE TRANSMISSION — EN ATTENTE DE NOUVELLES DONNÉES"
                : "FIN DE LA SESSION — EN ATTENTE DE NOUVELLES DONNÉES"}
            </p>
          </div>
        </section>
      </main>

      <footer className="fixed right-0 bottom-0 left-0 border-t border-border bg-card px-4 py-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-mono text-[10px] text-muted-foreground">
              ENVOIS: {logs.length}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              PRIORITÉ: {priorite.toUpperCase()}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              LATENCY: {latency === null ? "—" : `${latency}ms`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-muted-foreground">LOG_STREAMING_ON</span>
            <div className="h-1.5 w-1.5 rounded-full bg-success" />
          </div>
        </div>
      </footer>
    </div>
  );
}
