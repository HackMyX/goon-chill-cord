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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Tool declarations ─────────────────────────────────────────────────────────

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

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

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

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: systemPrompt,
      tools: [tools],
    });

    const chat = model.startChat({ history });

    let result = await chat.sendMessage(message);
    let response = result.response;
    const actionLog: Array<{ fn: string; result: Record<string, unknown> }> = [];

    // Function-call loop — Gemini may call multiple functions before final text
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
        fnParts.push({
          functionResponse: { name: call.name, response: fnResult },
        });
      }

      result = await chat.sendMessage(fnParts);
      response = result.response;
    }

    const reply = response.text();
    return NextResponse.json({ reply, actionLog });
  } catch (e) {
    console.error("AI chat error:", e);
    return NextResponse.json({ error: "KI-Fehler. Bitte versuche es erneut." }, { status: 500 });
  }
}
