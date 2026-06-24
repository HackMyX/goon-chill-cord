import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin, isModerator } from "@/lib/admin";
import { USER_SYSTEM_PROMPT, MOD_SYSTEM_PROMPT, ADMIN_SYSTEM_PROMPT } from "@/lib/ai-site-context";
import { getAiApiKey } from "@/lib/actions/ai-config";

// ── Model priority list ───────────────────────────────────────────────────
// Models with reliable function/tool-calling support on Groq.
const MODEL_PRIORITY = [
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile",
  "llama3-groq-70b-8192-tool-use-preview",
  "llama3-groq-8b-8192-tool-use-preview",
  "llama-3.1-8b-instant",
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

// ── Tool declarations (OpenAI-compatible JSON Schema format) ──────────────

type GroqTool = Groq.Chat.Completions.ChatCompletionTool;

const USER_TOOLS: GroqTool[] = [
  {
    type: "function",
    function: {
      name: "get_my_profile",
      description: "Vollständiges Profil des anfragenden Spielers abrufen: Credits, Streak-Tage, Inventar-Größe, Rolle, Einstellungen. Nutze das IMMER bei Fragen nach dem eigenen Profil, Credits, Streak oder Inventar.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_platform_info",
      description: "Aktuelle Plattform-Statistiken abrufen: Spieleranzahl, Items im Umlauf (sammelbar), aktive Cases, Shop-Angebote, laufende Auktionen. Nutze das IMMER bei Fragen nach Plattform-Zahlen oder 'Wie viele Items gibt es?'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_leaderboard",
      description: "Bestenliste abrufen: Top-10 nach Credits und nach Streak-Tagen. Nutze das bei Fragen wie 'Wer führt die Rangliste an?' oder 'Zeig mir die Bestenliste'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_player_settings",
      description: "Aktuelle Spielereinstellungen abrufen (Trades, Profil-Sichtbarkeit, Benachrichtigungen)",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "update_player_setting",
      description: "Spielereinstellung ändern: 'accepts_trades' oder 'profile_visible'",
      parameters: {
        type: "object",
        properties: {
          setting: { type: "string", description: "'accepts_trades' oder 'profile_visible'" },
          value: { type: "boolean", description: "true=an, false=aus" },
        },
        required: ["setting", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_notification_pref",
      description: "Eine Benachrichtigungseinstellung ändern",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Benachrichtigungstyp-Key" },
          value: { type: "boolean", description: "true=an, false=aus" },
        },
        required: ["key", "value"],
      },
    },
  },
];

const MOD_TOOLS: GroqTool[] = [
  ...USER_TOOLS,
  {
    type: "function",
    function: {
      name: "find_user",
      description: "Spieler nach Username suchen — gibt userId + Infos zurück",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Exakter oder teilweiser Username" },
        },
        required: ["username"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "warn_user",
      description: "Spieler verwarnen",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string", description: "User-ID des Spielers" },
          reason: { type: "string", description: "Begründung der Verwarnung" },
        },
        required: ["userId", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "temp_ban_user",
      description: "Spieler temporär sperren",
      parameters: {
        type: "object",
        properties: {
          userId: { type: "string" },
          hours: { type: "number", description: "Sperrdauer in Stunden" },
          reason: { type: "string" },
        },
        required: ["userId", "hours"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "lift_ban",
      description: "Temporären Ban aufheben",
      parameters: {
        type: "object",
        properties: { userId: { type: "string" } },
        required: ["userId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "close_ticket",
      description: "Support-Ticket schließen",
      parameters: {
        type: "object",
        properties: {
          ticketId: { type: "string" },
          reason: { type: "string", description: "Abschlussgrund (optional)" },
        },
        required: ["ticketId"],
      },
    },
  },
];

const ADMIN_TOOLS: GroqTool[] = [
  ...MOD_TOOLS,
  {
    type: "function",
    function: {
      name: "add_credits",
      description: "Credits zu JEDEM Spieler hinzufügen oder abziehen (auch Admins). Übergib username ODER userId — kein find_user nötig!",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Username des Spielers (bevorzugt — kein separater find_user nötig)" },
          userId: { type: "string", description: "User-ID (alternativ zu username)" },
          amount: { type: "number", description: "Betrag (negativ = abziehen)" },
          reason: { type: "string", description: "Optionaler Grund" },
        },
        required: ["amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "set_role",
      description: "Benutzerrolle setzen: 'user', 'moderator' oder 'admin'. Admin-Rolle kann NICHT entfernt werden (Sicherheitssperre). Übergib username ODER userId.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Username des Spielers" },
          userId: { type: "string", description: "User-ID (alternativ zu username)" },
          role: { type: "string", description: "'user', 'moderator' oder 'admin'" },
        },
        required: ["role"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reset_user",
      description: "Spieler zurücksetzen: Streak→0, Ban aufheben, Verwarnungen löschen. Admin-Rolle bleibt immer erhalten. Übergib username ODER userId.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Username des Spielers" },
          userId: { type: "string", description: "User-ID (alternativ zu username)" },
          resetCredits: { type: "boolean", description: "true = Credits auf 0 setzen" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_warnings",
      description: "Alle Verwarnungen eines Spielers löschen. Übergib username ODER userId.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Username des Spielers" },
          userId: { type: "string", description: "User-ID (alternativ zu username)" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_history",
      description: "Detaillierte Aktionshistorie abrufen (Verwarnungen, Bans, Credits). Übergib username ODER userId.",
      parameters: {
        type: "object",
        properties: {
          username: { type: "string", description: "Username des Spielers" },
          userId: { type: "string", description: "User-ID (alternativ zu username)" },
        },
        required: [],
      },
    },
  },
];

// ── User resolver — accepts userId OR username ────────────────────────────────

async function resolveUser(args: Record<string, unknown>): Promise<
  { userId: string; resolvedUsername: string } | { error: string }
> {
  const admin = createAdminClient();

  if (args.userId) {
    const { data } = await admin.from("profiles").select("id, username").eq("id", args.userId as string).single();
    if (!data) return { error: "Nutzer nicht gefunden." };
    return { userId: data.id as string, resolvedUsername: data.username as string };
  }

  if (args.username) {
    const name = (args.username as string).trim();
    const { data: exact } = await admin.from("profiles").select("id, username").ilike("username", name).limit(1);
    if (exact && exact.length > 0) return { userId: exact[0].id as string, resolvedUsername: exact[0].username as string };
    const { data: fuzzy } = await admin.from("profiles").select("id, username").ilike("username", `%${name}%`).limit(1);
    if (fuzzy && fuzzy.length > 0) return { userId: fuzzy[0].id as string, resolvedUsername: fuzzy[0].username as string };
    return { error: `Kein Spieler mit dem Namen "${name}" gefunden.` };
  }

  return { error: "userId oder username ist erforderlich." };
}

// ── Function executor ────────────────────────────────────────────────────────

async function executeFunction(
  name: string,
  args: Record<string, unknown>,
  context: "user" | "mod" | "admin"
): Promise<Record<string, unknown>> {
  try {
    switch (name) {
      case "get_my_profile": {
        const client = await createClient();
        const { data: { user: me } } = await client.auth.getUser();
        if (!me) return { error: "Nicht eingeloggt." };
        const adminDb = createAdminClient();
        const [{ data: profile }, { count: invCount }] = await Promise.all([
          adminDb
            .from("profiles")
            .select("username, credits, streak_days, role, accepts_trades, profile_visible, created_at, temp_banned_until")
            .eq("id", me.id)
            .single(),
          adminDb
            .from("inventory")
            .select("*", { count: "exact", head: true })
            .eq("user_id", me.id),
        ]);
        if (!profile) return { error: "Profil nicht gefunden." };
        const isBanned = !!(profile.temp_banned_until && new Date(profile.temp_banned_until as string) > new Date());
        return {
          username: profile.username,
          credits: profile.credits,
          streak_days: profile.streak_days,
          role: profile.role,
          accepts_trades: profile.accepts_trades,
          profile_visible: profile.profile_visible,
          inventory_count: invCount ?? 0,
          member_since: profile.created_at,
          is_temp_banned: isBanned,
        };
      }
      case "get_platform_info": {
        const adminDb = createAdminClient();
        const results = await Promise.allSettled([
          adminDb.from("profiles").select("*", { count: "exact", head: true }),
          adminDb.from("inventory").select("*", { count: "exact", head: true }),
          adminDb.from("case_groups").select("id, name").eq("is_active", true).limit(30),
          adminDb.from("shop_items").select("*", { count: "exact", head: true }).eq("is_active", true),
          adminDb.from("auctions").select("*", { count: "exact", head: true }).eq("status", "active"),
        ]);
        const userCount   = results[0].status === "fulfilled" ? (results[0].value.count ?? 0) : 0;
        const itemCount   = results[1].status === "fulfilled" ? (results[1].value.count ?? 0) : 0;
        const caseGroups  = results[2].status === "fulfilled" ? (results[2].value.data ?? []) : [];
        const shopCount   = results[3].status === "fulfilled" ? (results[3].value.count ?? 0) : 0;
        const auctionCount = results[4].status === "fulfilled" ? (results[4].value.count ?? 0) : 0;
        return {
          registered_players: userCount,
          collectible_items_in_circulation: itemCount,
          active_case_groups: caseGroups.length,
          case_group_names: (caseGroups as Array<{ name: string }>).map((g) => g.name),
          active_shop_offers: shopCount,
          active_auctions: auctionCount,
        };
      }
      case "get_leaderboard": {
        const adminDb = createAdminClient();
        const [{ data: byCredits }, { data: byStreak }] = await Promise.all([
          adminDb
            .from("profiles")
            .select("username, credits, streak_days")
            .eq("profile_visible", true)
            .order("credits", { ascending: false })
            .limit(10),
          adminDb
            .from("profiles")
            .select("username, streak_days")
            .eq("profile_visible", true)
            .gt("streak_days", 0)
            .order("streak_days", { ascending: false })
            .limit(10),
        ]);
        return {
          credits_top10: (byCredits ?? []).map((p, i) => ({
            rank: i + 1,
            username: p.username,
            credits: p.credits,
            streak_days: p.streak_days,
          })),
          streak_top10: (byStreak ?? []).map((p, i) => ({
            rank: i + 1,
            username: p.username,
            streak_days: p.streak_days,
          })),
        };
      }
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
        const res = await modWarnUser(args.userId as string, (args.reason as string) ?? "");
        return res as Record<string, unknown>;
      }
      case "temp_ban_user": {
        if (context === "user") return { error: "Keine Berechtigung." };
        const { modTempBan } = await import("@/lib/actions/mod");
        const res = await modTempBan(args.userId as string, args.hours as number, (args.reason as string) ?? "");
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
        const res = await modCloseTicket(args.ticketId as string, (args.reason as string) ?? "");
        return res as Record<string, unknown>;
      }
      case "add_credits": {
        if (context !== "admin") return { error: "Nur Admins können Credits vergeben." };
        const supabaseForCredits = await createClient();
        const { data: { user: adminUser } } = await supabaseForCredits.auth.getUser();
        if (!adminUser) return { error: "Nicht eingeloggt." };
        const { data: adminProf } = await supabaseForCredits.from("profiles").select("role").eq("id", adminUser.id).single();
        if (!isAdmin(adminProf)) return { error: "Keine Admin-Berechtigung." };
        const resolved = await resolveUser(args);
        if ("error" in resolved) return { success: false, error: resolved.error };
        const { userId: targetId, resolvedUsername } = resolved;
        const amount = args.amount as number;
        if (!amount || amount === 0) return { success: false, error: "Betrag darf nicht 0 sein." };
        const adminDb = createAdminClient();
        const { data: targetProfile } = await adminDb.from("profiles").select("credits").eq("id", targetId).single();
        if (!targetProfile) return { success: false, error: "Nutzer nicht gefunden." };
        const newCredits = Math.max(0, ((targetProfile.credits as number) ?? 0) + amount);
        const { error: credErr } = await adminDb.from("profiles").update({ credits: newCredits }).eq("id", targetId);
        if (credErr) return { success: false, error: credErr.message };
        await adminDb.from("mod_actions").insert({
          mod_id: adminUser.id, target_user_id: targetId,
          action_type: "credits_add", reason: (args.reason as string) || null,
          details: { amount, newTotal: newCredits, via: "admin_ai" },
        });
        return { success: true, username: resolvedUsername, oldCredits: targetProfile.credits, newCredits, amount };
      }
      case "set_role": {
        if (context !== "admin") return { error: "Keine Berechtigung." };
        const resolved2 = await resolveUser(args);
        if ("error" in resolved2) return { success: false, error: resolved2.error };
        const { userId: targetId2, resolvedUsername: rUser2 } = resolved2;
        const newRole = (args.role as string).toLowerCase();
        const validRoles = ["user", "moderator", "admin"];
        if (!validRoles.includes(newRole)) return { error: `Ungültige Rolle. Erlaubt: ${validRoles.join(", ")}` };
        const adminDb2 = createAdminClient();
        const { data: target2 } = await adminDb2.from("profiles").select("role, username").eq("id", targetId2).single();
        if (!target2) return { success: false, error: "Nutzer nicht gefunden." };
        if ((target2.role as string) === "admin" && newRole !== "admin") {
          return {
            success: false,
            error: `Admin-Berechtigung von "${rUser2}" kann nicht durch die KI entfernt werden. Bitte manuell im Admin-Panel → User-Management ändern.`,
          };
        }
        const { error: roleErr } = await adminDb2.from("profiles").update({ role: newRole }).eq("id", targetId2);
        if (roleErr) return { success: false, error: roleErr.message };
        return { success: true, username: target2.username as string, oldRole: target2.role as string, newRole };
      }
      case "reset_user": {
        if (context !== "admin") return { error: "Keine Berechtigung." };
        const resolved3 = await resolveUser(args);
        if ("error" in resolved3) return { success: false, error: resolved3.error };
        const { userId: targetId3 } = resolved3;
        const adminDb3 = createAdminClient();
        const { data: target3 } = await adminDb3.from("profiles").select("role, username, credits, streak_days").eq("id", targetId3).single();
        if (!target3) return { success: false, error: "Nutzer nicht gefunden." };
        const wasAdmin3 = (target3.role as string) === "admin";
        const patch: Record<string, unknown> = { streak_days: 0, temp_banned_until: null };
        if (args.resetCredits === true) patch.credits = 0;
        if (wasAdmin3) patch.role = "admin";
        const { error: resetErr } = await adminDb3.from("profiles").update(patch).eq("id", targetId3);
        if (resetErr) return { success: false, error: resetErr.message };
        await adminDb3.from("mod_actions").delete().eq("target_user_id", targetId3).eq("action_type", "warning");
        await adminDb3.from("mod_actions").delete().eq("target_user_id", targetId3).eq("action_type", "temp_ban");
        return {
          success: true,
          username: target3.username as string,
          wasAdmin: wasAdmin3,
          creditsReset: args.resetCredits === true,
          message: `${target3.username} wurde zurückgesetzt${wasAdmin3 ? " — Admin-Rolle bleibt erhalten" : ""}${args.resetCredits ? ", Credits auf 0 gesetzt" : ""}.`,
        };
      }
      case "remove_warnings": {
        if (context !== "admin") return { error: "Keine Berechtigung." };
        const resolved4 = await resolveUser(args);
        if ("error" in resolved4) return { success: false, error: resolved4.error };
        const { userId: targetId4, resolvedUsername: rUser4 } = resolved4;
        const adminDb4 = createAdminClient();
        const { error: warnErr } = await adminDb4.from("mod_actions").delete().eq("target_user_id", targetId4).eq("action_type", "warning");
        if (warnErr) return { success: false, error: warnErr.message };
        return { success: true, username: rUser4, message: `Alle Verwarnungen von ${rUser4} wurden gelöscht.` };
      }
      case "get_user_history": {
        if (context === "user") return { error: "Keine Berechtigung." };
        const resolved5 = await resolveUser(args);
        if ("error" in resolved5) return { success: false, error: resolved5.error };
        const { userId: targetId5 } = resolved5;
        const adminDb5 = createAdminClient();
        const { data: target5 } = await adminDb5.from("profiles")
          .select("id, username, role, credits, streak_days, temp_banned_until, created_at")
          .eq("id", targetId5).single();
        if (!target5) return { success: false, error: "Nutzer nicht gefunden." };
        const { data: history5 } = await adminDb5.from("mod_actions")
          .select("action_type, reason, details, created_at")
          .eq("target_user_id", targetId5)
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

function classifyGroqError(e: unknown): "invalid_key" | "quota" | "transient" | "bad_request" | "other" {
  if (e instanceof Groq.AuthenticationError) return "invalid_key";
  if (e instanceof Groq.RateLimitError) return "quota";
  if (e instanceof Groq.InternalServerError) return "transient";
  if (e instanceof Groq.BadRequestError) return "bad_request";

  const status = (e as { status?: number }).status;
  if (status === 401) return "invalid_key";
  if (status === 429) return "quota";
  if (status === 503 || status === 502) return "transient";
  if (status === 400) return "bad_request";

  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (msg.includes("rate limit") || msg.includes("quota") || msg.includes("too many")) return "quota";
  if (msg.includes("unauthorized") || msg.includes("invalid api key") || msg.includes("authentication")) return "invalid_key";
  if (msg.includes("service unavailable") || msg.includes("overloaded") || msg.includes("temporarily")) return "transient";

  return "other";
}

// ── Helper: sleep ─────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Core: call Groq with model fallback + tool-calling loop ───────────────

type HistoryMessage = { role: "user" | "assistant"; content: string };

interface GroqCallResult {
  reply: string;
  actionLog: Array<{ fn: string; result: Record<string, unknown> }>;
}

async function callGroq(opts: {
  apiKey: string;
  systemPrompt: string;
  tools: GroqTool[];
  history: HistoryMessage[];
  message: string;
  context: "user" | "mod" | "admin";
}): Promise<GroqCallResult> {
  const { apiKey, systemPrompt, tools, history, message, context } = opts;
  const groq = new Groq({ apiKey });

  const baseMessages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.slice(-10).map((h) => ({
      role: h.role,
      content: h.content,
    })),
    { role: "user", content: message },
  ];

  let lastError: unknown = null;

  for (const modelName of MODEL_PRIORITY) {
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [...baseMessages];
        const actionLog: Array<{ fn: string; result: Record<string, unknown> }> = [];

        let response = await groq.chat.completions.create({
          model: modelName,
          messages,
          tools,
          tool_choice: "auto",
          max_tokens: 2048,
          temperature: 0.7,
        });

        // Tool-calling loop (max 6 iterations)
        let iterations = 0;
        while (
          response.choices[0]?.finish_reason === "tool_calls" &&
          iterations < 6
        ) {
          iterations++;
          const assistantMsg = response.choices[0].message;

          // Add assistant turn (with tool_calls) to messages
          messages.push({
            role: "assistant",
            content: assistantMsg.content ?? null,
            tool_calls: assistantMsg.tool_calls,
          });

          const toolCalls = assistantMsg.tool_calls ?? [];
          for (const toolCall of toolCalls) {
            let fnArgs: Record<string, unknown> = {};
            try {
              fnArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
            } catch { /* invalid JSON from model — skip parsing */ }

            const fnResult = await executeFunction(toolCall.function.name, fnArgs, context);
            actionLog.push({ fn: toolCall.function.name, result: fnResult });

            messages.push({
              role: "tool",
              content: JSON.stringify(fnResult),
              tool_call_id: toolCall.id,
            });
          }

          response = await groq.chat.completions.create({
            model: modelName,
            messages,
            tools,
            tool_choice: "auto",
            max_tokens: 2048,
            temperature: 0.7,
          });
        }

        const reply =
          response.choices[0]?.message?.content?.trim() ??
          (actionLog.length > 0 ? "Aktion erfolgreich ausgeführt." : "");

        return { reply, actionLog };
      } catch (e) {
        lastError = e;
        const kind = classifyGroqError(e);

        // Key errors — no point trying other models with same key
        if (kind === "invalid_key") throw e;

        // Rate-limited — skip remaining attempts on this model, try next
        if (kind === "quota") break;

        // Bad request (model may not support tools) — skip to next model
        if (kind === "bad_request") break;

        // Transient / other: one quick retry, then next model
        if (attempt < 1) await sleep(600);
      }
    }
  }

  throw lastError ?? new Error("Alle KI-Modelle nicht verfügbar.");
}

// ── Route handler ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const apiKey = await getAiApiKey();

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Kein Groq API-Schlüssel konfiguriert. " +
          "Bitte im Admin-Panel → KI-Assistent einen gültigen Schlüssel eintragen.",
      },
      { status: 503 }
    );
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    if (!allowRequest(user.id)) {
      return NextResponse.json(
        { error: "Zu viele Anfragen — bitte warte eine Minute und versuche es erneut." },
        { status: 429 }
      );
    }

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();

    const body = await req.json() as {
      message: string;
      history: HistoryMessage[];
      context: "user" | "mod" | "admin";
    };

    const { message, history = [], context: rawContext } = body;
    if (!message?.trim()) return NextResponse.json({ error: "Keine Nachricht." }, { status: 400 });

    // Enforce role-based context: users can't escalate to admin/mod via the request body
    let context: "user" | "mod" | "admin" = "user";
    if (rawContext === "admin" && isAdmin(profile)) context = "admin";
    else if ((rawContext === "mod" || rawContext === "admin") && isModerator(profile)) context = "mod";

    const systemPrompt =
      context === "admin" ? ADMIN_SYSTEM_PROMPT :
      context === "mod"   ? MOD_SYSTEM_PROMPT :
                            USER_SYSTEM_PROMPT;

    const tools: GroqTool[] =
      context === "admin" ? ADMIN_TOOLS :
      context === "mod"   ? MOD_TOOLS :
                            USER_TOOLS;

    const { reply, actionLog } = await callGroq({
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
    const kind = classifyGroqError(e);
    console.error(`[ai-chat] kind=${kind} error=${raw}`);

    let userMsg: string;

    switch (kind) {
      case "invalid_key":
        userMsg =
          "Der Groq API-Schlüssel ist ungültig oder abgelaufen. " +
          "Bitte im Admin-Panel → KI-Assistent einen gültigen Schlüssel eintragen.";
        break;
      case "quota":
        userMsg =
          "Das KI-Rate-Limit wurde erreicht. " +
          "Bitte versuche es in einer Minute erneut oder trage im Admin-Panel einen anderen Schlüssel ein.";
        break;
      case "transient":
        userMsg = "Der KI-Dienst ist momentan überlastet. Bitte versuche es in 30 Sekunden erneut.";
        break;
      default:
        userMsg =
          "KI-Fehler: " + raw.slice(0, 200) +
          " — Bitte im Admin-Panel → KI-Assistent → Schlüssel testen für Details.";
    }

    return NextResponse.json({ error: userMsg }, { status: 500 });
  }
}
