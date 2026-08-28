import { createServerFn } from "@tanstack/react-start";

export type ClaudeResult =
  | { ok: true; text: string; model: string }
  | { ok: false; code: string; error: string };

type ClaudeInput = {
  prompt: string;
  system?: string;
  maxTokens?: number;
};

const MODEL = "claude-sonnet-4-5-20250929";

export const askClaude = createServerFn({ method: "POST" })
  .inputValidator((input: ClaudeInput) => {
    const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
    return {
      prompt,
      system: typeof input?.system === "string" ? input.system.trim() : "",
      maxTokens:
        typeof input?.maxTokens === "number" && input.maxTokens > 0
          ? Math.min(input.maxTokens, 4096)
          : 1024,
    };
  })
  .handler(async ({ data }): Promise<ClaudeResult> => {
    // 1. Requête vide
    if (!data.prompt) {
      return { ok: false, code: "EMPTY_REQUEST", error: "Le message est vide." };
    }

    // 2. Clé API absente (lue côté serveur uniquement, jamais exposée au client)
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      return {
        ok: false,
        code: "MISSING_API_KEY",
        error:
          "ANTHROPIC_API_KEY n'est pas configurée. Ajoutez-la dans les secrets du projet.",
      };
    }

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: data.maxTokens,
          ...(data.system ? { system: data.system } : {}),
          messages: [{ role: "user", content: data.prompt }],
        }),
      });
    } catch (err) {
      console.error("Anthropic network error", err);
      return {
        ok: false,
        code: "NETWORK_ERROR",
        error: "Impossible de joindre l'API Anthropic.",
      };
    }

    if (!res.ok) {
      const body = await res.text();
      console.error("Anthropic API error", res.status, body);

      // 3. Clé invalide
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          code: "INVALID_API_KEY",
          error: "Clé API Anthropic invalide ou non autorisée.",
        };
      }
      // 4. Rate limit
      if (res.status === 429) {
        return {
          ok: false,
          code: "RATE_LIMITED",
          error: "Limite de requêtes atteinte. Réessayez dans un instant.",
        };
      }
      if (res.status === 400) {
        return {
          ok: false,
          code: "BAD_REQUEST",
          error: "Requête refusée par l'API Anthropic (paramètres invalides).",
        };
      }
      if (res.status === 529 || res.status >= 500) {
        return {
          ok: false,
          code: "UPSTREAM_ERROR",
          error: "L'API Anthropic est temporairement indisponible.",
        };
      }
      return {
        ok: false,
        code: "API_ERROR",
        error: `Erreur de l'API Anthropic (statut ${res.status}).`,
      };
    }

    try {
      const json = (await res.json()) as {
        model?: string;
        content?: Array<{ type: string; text?: string }>;
      };
      const text = (json.content ?? [])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text)
        .join("\n")
        .trim();

      if (!text) {
        return {
          ok: false,
          code: "EMPTY_RESPONSE",
          error: "Claude n'a renvoyé aucun contenu.",
        };
      }
      return { ok: true, text, model: json.model ?? MODEL };
    } catch (err) {
      console.error("Anthropic parse error", err);
      return {
        ok: false,
        code: "PARSE_ERROR",
        error: "Réponse illisible de l'API Anthropic.",
      };
    }
  });
