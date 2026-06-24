import { NextRequest, NextResponse } from "next/server";
import {
  GoogleGenerativeAI,
  SchemaType,
  type Tool,
  type Part,
  type Content,
} from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isModerator } from "@/lib/admin";
import { USER_SYSTEM_PROMPT, MOD_SYSTEM_PROMPT, ADMIN_SYSTEM_PROMPT } from "@/lib/ai-site-context";

// ── Model priority list ───────────────────────────────────────────────────
// gemini-2.5-flash:      proven primary (free tier, good quota)
// gemini-2.5-flash-lite: fallback (may be 503 during high demand, retried)
const MODEL_PRIORITY = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

// ── Per-user in-memory rate limiter (max 12 req/min) ─────────────────────
const RL = new Map<string, { n: number; t: number }>();
const RL_WINDOW = 60_000;
const RL_MAX = 12;

function allowRequest(userId: string): boolean {
  const now = Date.now();
  const e = RL.get(userId);
  if (!e || now - e.t > RL_WINDOW) {
    RL.set(userId, { n: 1, t: now });
    return true;
  }
  if (e.n >= RL_MAX) return false;
  e.n++;
  return true;
}

// ── Tool declarations ─────────────────────────────────────────────────────

const USER_TOOLS: Tool = {
  functionDeclarations: [
    {
      name: "get_player_settings",
      description: "Aktuelle Spielereinstellungen abrufen (Trades, Profil-Sichtbarkeit, Benachrichtigungen)",
      parameters: { type: SchemaType.OBJECT, properties: {} },
    },
    {
      name: "update_player_setting",
      description: "Spielereinstellung ändern: 'accepts_trades' oder 'profile_visible'",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          setting: { type: SchemaType.STRING, description: "'accepts_trades' oder 'profile_visible'" },
          value: { type: SchemaType.BOOLEAN, description: "true=an, false=aus" },
        },
        required: ["setting", "value"],
      },
    },
    {
      name: "update_notification_pref",
      description: "Eine Benachrichtigungseinstellung ändern",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          key: { type: SchemaType.STRING, description: "Benachrichtigungstyp-Key" },
          value: { type: SchemaType.BOOLEAN, description: "true=an, false=aus" },
        },
        required: ["key", "value"],
      },
    },
  ],
};

const MOD_TOOLS: Tool = {
  functionDeclarations: [
    ...USER_TOOLS.functionDeclarations!,
    {
      name: "find_user",
      description: "Spieler nach Username suchen — gibt userId + Infos zurück",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          username: { type: SchemaType.STRING, description: "Exakter oder teilweiser Username" },
        },
        required: ["username"],
      },
    },
    {
      name: "warn_user",
      description: "Spieler verwarnen",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userId: { type: SchemaType.STRING, description: "User-ID des Spielers" },
          reason: { type: SchemaType.STRING, description: "Begründung der Verwarnung" },
        },
        required: ["userId", "reason"],
      },
    },
    {
      name: "temp_ban_user",
      description: "Spieler temporär sperren",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userId: { type: SchemaType.STRING },
          hours: { type: SchemaType.NUMBER, description: "Sperrdauer in Stunden" },
          reason: { type: SchemaType.STRING },
        },
        required: ["userId", "hours"],
      },
    },
    {
      name: "lift_ban",
      description: "Temporären Ban aufheben",
      parameters: {
        type: SchemaType.OBJECT,
        properties: { userId: { type: SchemaType.STRING } },
        required: ["userId"],
      },
    },
    {
      name: "close_ticket",
      description: "Support-Ticket schließen",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          ticketId: { type: SchemaType.STRING },
          reason: { type: SchemaType.STRING, description: "Abschlussgrund (optional)" },
        },
        required: ["ticketId"],
      },
    },
  ],
};

const ADMIN_TOOLS: Tool = {
  functionDeclarations: [
    ...MOD_TOOLS.functionDeclarations!,
    {
      name: "add_credits",
      description: "Credits zu einem Spieler hinzufügen oder abziehen (negativer Wert = abziehen)",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userId: { type: SchemaType.STRING },
          amount: { type: SchemaType.NUMBER, description: "Betrag (negativ = abziehen)" },
        },
        required: ["userId", "amount"],
      },
    },
  ],
};

// ── Function executor ────────────────────────────────────────────────────────

async function executeFunction(
  name: string,
  args: Record<string, unknown>,
  context: "user" | "mod" | "admin"
): Promise<Record<string, unknown>> {
  try {
    switch (name) {
      case "get_player_settings": {
        const { getPlayerSettings, getNotificationPrefs } = await import("@/lib/actions/account");
        const [settings, notifPrefs] = await Promise.all([getPlayerSettings(), getNotificationPrefs()]);
        return { success: true, settings, notifPrefs };
      }
      case "update_player_setting": {
        const { updatePlayerSettings } = await import("@/lib/actions/account");
        const setting = args.setting as string;
        const value = args.value as boolean;
        const payload =
          setting === "accepts_trades"
            ? { acceptsTrades: value }
            : { profileVisible: value };
        const res = await updatePlayerSettings(payload);
        return res as unknown as Record<string, unknown>;
      }
      case "update_notification_pref": {
        const { getNotificationPrefs, updateNotificationPrefs } = await import("@/lib/actions/account");
        const current = await getNotificationPrefs();
        const updated = { ...current, [args.key as string]: args.value as boolean };
        const res = await updateNotificationPrefs(updated);
        return res as unknown as Record<string, unknown>;
      }
      case "find_user": {
        if (context === "user") return { error: "Keine Berechtigung." };
        const admin = createAdminClient();
        const { data } = await admin
          .from("profiles")
          .select("id, username, role, credits, temp_banned_until, created_at")
          .ilike("username", `%${args.username as string}%`)
          .limit(5);
        if (!data || data.length === 0) return { found: false, message: "Kein Spieler mit diesem Namen gefunden." };
        return { found: true, users: data };
      }
      case "warn_user": {
        if (context === "user") return { error: "Keine Berechtigung." };
        const { modWarnUser } = await import("@/lib/actions/mod");
        const res = await modWarnUser(args.userId as string, args.reason as string ?? "");
        return res as Record<string, unknown>;
      }
      case "temp_ban_user": {
        if (context === "user") return { error: "Keine Berechtigung." };
        const { modTempBan } = await import("@/lib/actions/mod");
        const res = await modTempBan(args.userId as string, args.hours as number, args.reason as string ?? "");
        return res as Record<string, unknown>;
      }
      case "lift_ban": {
        if (context === "user") return { error: "Keine Berechtigung." };
        const { modLiftBan } = await import("@/lib/actions/mod");
        const res = await modLiftBan(args.userId as string);
        return res as Record<string, unknown>;
      }
      case "close_ticket": {
        if (context === "user") return { error: "Keine Berechtigung." };
        const { modCloseTicket } = await import("@/lib/actions/mod");
        const res = await modCloseTicket(args.ticketId as string, args.reason as string ?? "");
        return res as Record<string, unknown>;
      }
      case "add_credits": {
        if (context !== "admin") return { error: "Nur Admins können Credits vergeben." };
        const { modAddCredits } = await import("@/lib/actions/mod");
        const res = await modAddCredits(args.userId as string, args.amount as number, "");
        return res as Record<string, unknown>;
      }
      default:
        return { error: `Unbekannte Funktion: ${name}` };
    }
  } catch (e) {
    return { error: String(e) };
  }
}

// ── Helper: error classification ──────────────────────────────────────────

function isQuotaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("429") ||
    msg.includes("Too Many Requests") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("quota")
  );
}

function isTransientError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("503") ||
    msg.includes("502") ||
    msg.includes("Service Unavailable") ||
    msg.includes("high demand") ||
    msg.includes("overloaded")
  );
}

// ── Helper: sleep ─────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Core: call Gemini with model fallback + retry ─────────────────────────

interface GeminiCallResult {
  reply: string;
  actionLog: Array<{ fn: string; result: Record<string, unknown> }>;
}

async function callGemini(opts: {
  apiKey: string;
  systemPrompt: string;
  tools: Tool;
  history: Content[];
  message: string;
  context: "user" | "mod" | "admin";
}): Promise<GeminiCallResult> {
  const { apiKey, systemPrompt, tools, history, message, context } = opts;

  // Trim history to last 10 entries (5 turns) to limit token usage
  const trimmedHistory = history.slice(-10);

  let lastError: unknown = null;

  for (const modelName of MODEL_PRIORITY) {
    // Each model gets up to 3 attempts total
    for (let attempt = 0; attempt <= 2; attempt++) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: systemPrompt,
          tools: [tools],
        });

        const chat = model.startChat({ history: trimmedHistory });
        let result = await chat.sendMessage(message);
        let response = result.response;
        const actionLog: Array<{ fn: string; result: Record<string, unknown> }> = [];

        // Function-call loop
        let iterations = 0;
        while (response.functionCalls()?.length && iterations < 6) {
          iterations++;
          const calls = response.functionCalls()!;
          const fnParts: Part[] = [];

          for (const call of calls) {
            const fnResult = await executeFunction(
              call.name,
              call.args as Record<string, unknown>,
              context
            );
            actionLog.push({ fn: call.name, result: fnResult });
            fnParts.push({ functionResponse: { name: call.name, response: fnResult } });
          }

          result = await chat.sendMessage(fnParts);
          response = result.response;
        }

        return { reply: response.text(), actionLog };
      } catch (e) {
        lastError = e;

        const quota = isQuotaError(e);
        const transient = isTransientError(e);

        if (!quota && !transient) {
          // Hard error (auth, bad request…) — don't retry at all
          throw e;
        }

        if (quota) {
          // Daily/minute quota exhausted → skip remaining attempts on this model, try next
          break;
        }

        // Transient 503/overloaded → retry same model with backoff
        if (attempt < 2) {
          await sleep((attempt + 1) * 2_500);
        }
        // After 3 attempts on transient → fall through to next model
      }
    }
  }

  // All models exhausted
  throw lastError ?? new Error("Alle KI-Modelle nicht verfügbar.");
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "KI-Assistent ist nicht konfiguriert (fehlender API-Key)." },
      { status: 500 }
    );
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    // Per-user rate limit
    if (!allowRequest(user.id)) {
      return NextResponse.json(
        { error: "Zu viele Anfragen — bitte warte kurz und versuche es erneut." },
        { status: 429 }
      );
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

    const body = await req.json() as {
      message: string;
      history: Content[];
      context: "user" | "mod" | "admin";
    };

    const { message, history = [], context: rawContext } = body;
    if (!message?.trim()) return NextResponse.json({ error: "Keine Nachricht." }, { status: 400 });

    // Determine actual context based on role
    let context: "user" | "mod" | "admin" = "user";
    if (rawContext === "admin" && isAdmin(profile)) context = "admin";
    else if ((rawContext === "mod" || rawContext === "admin") && isModerator(profile)) context = "mod";

    const systemPrompt =
      context === "admin" ? ADMIN_SYSTEM_PROMPT :
      context === "mod" ? MOD_SYSTEM_PROMPT :
      USER_SYSTEM_PROMPT;

    const tools: Tool =
      context === "admin" ? ADMIN_TOOLS :
      context === "mod" ? MOD_TOOLS :
      USER_TOOLS;

    const { reply, actionLog } = await callGemini({
      apiKey,
      systemPrompt,
      tools,
      history,
      message: message.trim(),
      context,
    });

    return NextResponse.json({ reply, actionLog });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error("AI chat error:", raw);

    // User-friendly error messages — never expose raw API errors
    let userMsg = "Der KI-Assistent ist gerade nicht verfügbar. Bitte versuche es in einer Minute erneut.";

    if (isQuotaError(e)) {
      userMsg = "Der KI-Assistent hat sein Tageslimit erreicht. Bitte versuche es morgen oder in einigen Stunden erneut.";
    } else if (isTransientError(e)) {
      userMsg = "Der KI-Assistent ist gerade überlastet. Bitte warte 30 Sekunden und versuche es erneut.";
    } else if (raw.includes("API_KEY") || raw.includes("API key") || raw.includes("401") || raw.includes("403")) {
      userMsg = "KI-Konfigurationsfehler — bitte Administrator kontaktieren.";
    } else if (raw.includes("SAFETY") || raw.includes("blocked")) {
      userMsg = "Diese Anfrage konnte aus Sicherheitsgründen nicht verarbeitet werden.";
    }

    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
