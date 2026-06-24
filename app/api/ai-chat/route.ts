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
      description: "Credits zu JEDEM Spieler hinzufügen oder abziehen — funktioniert auch für Admins (negativer Wert = abziehen). Kein Mod-Berechtigungs-Check.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userId: { type: SchemaType.STRING, description: "User-ID des Spielers" },
          amount: { type: SchemaType.NUMBER, description: "Betrag (negativ = abziehen)" },
          reason: { type: SchemaType.STRING, description: "Optionaler Grund" },
        },
        required: ["userId", "amount"],
      },
    },
    {
      name: "set_role",
      description: "Benutzerrolle setzen: 'user', 'moderator' oder 'admin'. ACHTUNG: Admin-Rollen können NICHT durch die KI entfernt werden (Sicherheitssperre).",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userId: { type: SchemaType.STRING, description: "User-ID des Spielers" },
          role: { type: SchemaType.STRING, description: "'user', 'moderator' oder 'admin'" },
        },
        required: ["userId", "role"],
      },
    },
    {
      name: "reset_user",
      description: "Spieler komplett zurücksetzen: Streak→0, Ban aufheben, alle Verwarnungen löschen. Admin-Rolle bleibt IMMER erhalten (kann via KI nicht entfernt werden). Optional Credits auf 0.",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userId: { type: SchemaType.STRING, description: "User-ID des Spielers" },
          resetCredits: { type: SchemaType.BOOLEAN, description: "true = Credits auf 0 setzen, false/weggelassen = Credits beibehalten" },
        },
        required: ["userId"],
      },
    },
    {
      name: "remove_warnings",
      description: "Alle Verwarnungen eines Spielers löschen",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userId: { type: SchemaType.STRING, description: "User-ID des Spielers" },
        },
        required: ["userId"],
      },
    },
    {
      name: "get_user_history",
      description: "Detaillierte Aktionshistorie eines Spielers abrufen (Verwarnungen, Bans, Credit-Änderungen, Notizen)",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          userId: { type: SchemaType.STRING, description: "User-ID des Spielers" },
        },
        required: ["userId"],
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
        // Direct admin-client path — bypasses mod-permission check, works for ALL users incl. admins
        const supabaseForCredits = await createClient();
        const { data: { user: adminUser } } = await supabaseForCredits.auth.getUser();
        if (!adminUser) return { error: "Nicht eingeloggt." };
        const { data: adminProf } = await supabaseForCredits.from("profiles").select("role").eq("id", adminUser.id).single();
        if (!isAdmin(adminProf)) return { error: "Keine Admin-Berechtigung." };
        const adminDb = createAdminClient();
        const targetId = args.userId as string;
        const amount = args.amount as number;
        if (!amount || amount === 0) return { success: false, error: "Betrag darf nicht 0 sein." };
        const { data: target } = await adminDb.from("profiles").select("credits, username").eq("id", targetId).single();
        if (!target) return { success: false, error: "Nutzer nicht gefunden." };
        const newCredits = Math.max(0, ((target.credits as number) ?? 0) + amount);
        const { error: credErr } = await adminDb.from("profiles").update({ credits: newCredits }).eq("id", targetId);
        if (credErr) return { success: false, error: credErr.message };
        await adminDb.from("mod_actions").insert({
          mod_id: adminUser.id, target_user_id: targetId,
          action_type: "credits_add", reason: (args.reason as string) || null,
          details: { amount, newTotal: newCredits, via: "admin_ai" },
        });
        return { success: true, username: target.username, oldCredits: target.credits, newCredits, amount };
      }
      case "set_role": {
        if (context !== "admin") return { error: "Keine Berechtigung." };
        const adminDb2 = createAdminClient();
        const targetId2 = args.userId as string;
        const newRole = (args.role as string).toLowerCase();
        const validRoles = ["user", "moderator", "admin"];
        if (!validRoles.includes(newRole)) return { error: `Ungültige Rolle. Erlaubt: ${validRoles.join(", ")}` };
        const { data: target2 } = await adminDb2.from("profiles").select("role, username").eq("id", targetId2).single();
        if (!target2) return { success: false, error: "Nutzer nicht gefunden." };
        if ((target2.role as string) === "admin" && newRole !== "admin") {
          return { success: false, error: "Admin-Berechtigungen können nicht durch die KI entfernt werden. Bitte manuell im Admin-Panel ändern." };
        }
        const { error: roleErr } = await adminDb2.from("profiles").update({ role: newRole }).eq("id", targetId2);
        if (roleErr) return { success: false, error: roleErr.message };
        return { success: true, username: target2.username as string, oldRole: target2.role as string, newRole };
      }
      case "reset_user": {
        if (context !== "admin") return { error: "Keine Berechtigung." };
        const adminDb3 = createAdminClient();
        const targetId3 = args.userId as string;
        const { data: target3 } = await adminDb3.from("profiles").select("role, username, credits, streak_days").eq("id", targetId3).single();
        if (!target3) return { success: false, error: "Nutzer nicht gefunden." };
        const wasAdmin3 = (target3.role as string) === "admin";
        const patch: Record<string, unknown> = { streak_days: 0, temp_banned_until: null };
        if (args.resetCredits === true) patch.credits = 0;
        if (wasAdmin3) patch.role = "admin"; // Always preserve admin role
        const { error: resetErr } = await adminDb3.from("profiles").update(patch).eq("id", targetId3);
        if (resetErr) return { success: false, error: resetErr.message };
        await adminDb3.from("mod_actions").delete().eq("target_user_id", targetId3).eq("action_type", "warning");
        await adminDb3.from("mod_actions").delete().eq("target_user_id", targetId3).eq("action_type", "temp_ban");
        return {
          success: true,
          username: target3.username as string,
          wasAdmin: wasAdmin3,
          creditsReset: args.resetCredits === true,
          message: `${target3.username} wurde zurückgesetzt${wasAdmin3 ? " (Admin-Rolle beibehalten)" : ""}.`,
        };
      }
      case "remove_warnings": {
        if (context !== "admin") return { error: "Keine Berechtigung." };
        const adminDb4 = createAdminClient();
        const { data: target4 } = await adminDb4.from("profiles").select("username").eq("id", args.userId as string).single();
        if (!target4) return { success: false, error: "Nutzer nicht gefunden." };
        const { error: warnErr } = await adminDb4.from("mod_actions").delete().eq("target_user_id", args.userId as string).eq("action_type", "warning");
        if (warnErr) return { success: false, error: warnErr.message };
        return { success: true, username: target4.username as string };
      }
      case "get_user_history": {
        if (context === "user") return { error: "Keine Berechtigung." };
        const adminDb5 = createAdminClient();
        const { data: target5 } = await adminDb5.from("profiles")
          .select("id, username, role, credits, streak_days, temp_banned_until, created_at")
          .eq("id", args.userId as string).single();
        if (!target5) return { success: false, error: "Nutzer nicht gefunden." };
        const { data: history5 } = await adminDb5.from("mod_actions")
          .select("action_type, reason, details, created_at")
          .eq("target_user_id", args.userId as string)
          .order("created_at", { ascending: false }).limit(20);
        return { success: true, user: target5, history: history5 ?? [] };
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
