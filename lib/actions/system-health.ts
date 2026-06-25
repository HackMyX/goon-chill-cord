"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

export type HealthStatus = "ok" | "warn" | "error";

export interface HealthCheck {
  id: string;
  category: string;
  name: string;
  status: HealthStatus;
  detail: string | null;
}

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht eingeloggt");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!isAdmin(profile)) throw new Error("Kein Admin");
}

export async function runSystemHealthChecks(): Promise<HealthCheck[]> {
  await requireAdmin();
  const admin = createAdminClient();
  const results: HealthCheck[] = [];

  // ── DB Connectivity ───────────────────────────────────────────────────────
  try {
    const { error } = await admin.from("profiles").select("id").limit(1);
    results.push({ id: "db_conn", category: "Datenbank", name: "Verbindung", status: error ? "error" : "ok", detail: error?.message ?? null });
  } catch (e) {
    results.push({ id: "db_conn", category: "Datenbank", name: "Verbindung", status: "error", detail: String(e) });
  }

  // ── Required Tables ────────────────────────────────────────────────────────
  const tables = [
    "profiles", "notifications", "tickets", "ticket_messages",
    "mod_actions", "mod_permissions", "inventory", "items",
    "case_tiers", "auctions", "trades", "audit_logs",
    "patch_notes", "snake_scores", "debug_logs",
    "login_events", "fingerprints",
  ];
  for (const tbl of tables) {
    try {
      const { error } = await admin.from(tbl).select("*").limit(0);
      results.push({ id: `table_${tbl}`, category: "Tabellen", name: tbl, status: error ? "error" : "ok", detail: error?.message ?? null });
    } catch (e) {
      results.push({ id: `table_${tbl}`, category: "Tabellen", name: tbl, status: "error", detail: String(e) });
    }
  }

  // ── Optional / newly added tables ─────────────────────────────────────────
  const optionalTables = [
    "surveys", "survey_questions", "survey_answers", "survey_responses",
    "polls", "poll_options", "poll_votes",
    "battle_passes", "battle_pass_tiers", "user_battle_passes", "user_bp_tier_claims",
  ];
  for (const tbl of optionalTables) {
    try {
      const { error } = await admin.from(tbl).select("*").limit(0);
      results.push({ id: `table_opt_${tbl}`, category: "Optionale Tabellen", name: tbl, status: error ? "warn" : "ok", detail: error ? `Nicht vorhanden — Migration ausführen (scripts/add-battlepass-upgrades.sql)` : null });
    } catch (e) {
      results.push({ id: `table_opt_${tbl}`, category: "Optionale Tabellen", name: tbl, status: "warn", detail: String(e) });
    }
  }

  // ── Config Rows ────────────────────────────────────────────────────────────
  const configChecks: { id: string; table: string; pkCol: string; pkVal: string; name: string }[] = [
    { id: "cfg_mod", table: "mod_permissions", pkCol: "id", pkVal: "default", name: "mod_permissions.default" },
  ];
  for (const c of configChecks) {
    try {
      const { data, error } = await admin.from(c.table).select("*").eq(c.pkCol, c.pkVal).single();
      results.push({ id: c.id, category: "Konfiguration", name: c.name, status: error || !data ? "warn" : "ok", detail: error ? `Kein Eintrag gefunden` : null });
    } catch (e) {
      results.push({ id: c.id, category: "Konfiguration", name: c.name, status: "warn", detail: String(e) });
    }
  }

  // ── Snake Config ───────────────────────────────────────────────────────────
  try {
    const { data, error } = await admin.from("snake_config").select("*").limit(1);
    const hasCfg = !error && data && data.length > 0;
    results.push({ id: "cfg_snake", category: "Konfiguration", name: "snake_config", status: hasCfg ? "ok" : "warn", detail: hasCfg ? null : "Keine Snake-Konfiguration — Standard wird verwendet" });
  } catch (e) {
    results.push({ id: "cfg_snake", category: "Konfiguration", name: "snake_config", status: "warn", detail: String(e) });
  }

  // ── Config singleton rows ──────────────────────────────────────────────────
  const singletons: { id: string; table: string; name: string }[] = [
    { id: "cfg_site", table: "site_config", name: "site_config (Singleton)" },
    { id: "cfg_streak", table: "streak_config", name: "streak_config" },
    { id: "cfg_shop", table: "shop_settings", name: "shop_settings" },
    { id: "cfg_world", table: "world_config", name: "world_config" },
    { id: "cfg_char", table: "character_config", name: "character_config" },
  ];
  for (const s of singletons) {
    try {
      const { data, error } = await admin.from(s.table).select("*").limit(1);
      const hasRow = !error && data && data.length > 0;
      results.push({ id: s.id, category: "Konfiguration", name: s.name, status: error ? "error" : hasRow ? "ok" : "warn", detail: error ? error.message : hasRow ? null : "Kein Konfig-Eintrag gefunden — Default-Werte in Verwendung" });
    } catch (e) {
      results.push({ id: s.id, category: "Konfiguration", name: s.name, status: "error", detail: String(e) });
    }
  }

  // ── Environment variables ──────────────────────────────────────────────────
  const envVars: { key: string; id: string; severity: "error" | "warn" }[] = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", id: "env_sb_url", severity: "error" },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", id: "env_sb_anon", severity: "error" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", id: "env_sb_service", severity: "error" },
    { key: "GROQ_API_KEY", id: "env_groq", severity: "warn" },
  ];
  const envDetails: Record<string, string> = {
    "NEXT_PUBLIC_SUPABASE_URL": "Supabase URL fehlt — App kann nicht verbinden.",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "Supabase Anon Key fehlt — App kann nicht verbinden.",
    "SUPABASE_SERVICE_ROLE_KEY": "Service Role Key fehlt — Admin-Operationen schlagen fehl.",
    "GROQ_API_KEY": "GROQ API-Schlüssel fehlt — KI-Chat nicht funktionsfähig. In .env.local setzen und Server neu starten. (Alternativ: Key im Admin-Panel unter 'KI-Chat' hinterlegen.)",
  };
  for (const ev of envVars) {
    const present = !!(process.env[ev.key]);
    results.push({
      id: ev.id,
      category: "Umgebungsvariablen",
      name: ev.key,
      status: present ? "ok" : ev.severity,
      detail: present ? null : (envDetails[ev.key] ?? `${ev.key} fehlt`),
    });
  }

  // ── AI Config (GROQ key from DB or env) ───────────────────────────────────
  try {
    const { data: aiRow } = await admin.from("ai_config").select("groq_api_key").eq("id", "default").maybeSingle();
    const dbKey = (aiRow?.groq_api_key as string | null)?.trim() || null;
    const envKey = process.env.GROQ_API_KEY || null;
    const hasKey = !!(dbKey || envKey);
    const src = dbKey ? "DB (admin gesetzt)" : envKey ? ".env.local" : "fehlt";
    results.push({
      id: "ai_groq_key",
      category: "KI / Chat",
      name: "GROQ-API-Schlüssel",
      status: hasKey ? "ok" : "warn",
      detail: hasKey ? `Quelle: ${src}` : "Kein GROQ-Schlüssel gefunden — KI-Chat deaktiviert.",
    });
  } catch (e) {
    results.push({ id: "ai_groq_key", category: "KI / Chat", name: "GROQ-API-Schlüssel", status: "warn", detail: `Konnte nicht geprüft werden: ${String(e)}` });
  }

  // ── Battle pass config ─────────────────────────────────────────────────────
  try {
    const { error } = await admin.from("battle_passes").select("id").limit(0);
    if (error) {
      results.push({ id: "bp_tables", category: "Battle Pass", name: "battle_passes Tabelle", status: "error", detail: `Tabelle fehlt — SQL-Migration ausführen: scripts/add-battlepass-upgrades.sql. Fehler: ${error.message}` });
    } else {
      const { data: activePasses } = await admin.from("battle_passes").select("id").eq("is_active", true);
      const count = activePasses?.length ?? 0;
      results.push({ id: "bp_active", category: "Battle Pass", name: "Aktiver Battle Pass", status: count === 1 ? "ok" : count === 0 ? "warn" : "warn", detail: count === 0 ? "Kein aktiver Battle Pass — im Admin-Panel aktivieren." : count > 1 ? `${count} aktive Pässe — sollte immer nur 1 sein.` : null });
    }
  } catch (e) {
    results.push({ id: "bp_tables", category: "Battle Pass", name: "battle_passes Tabelle", status: "error", detail: String(e) });
  }

  // ── Profiles without usernames ─────────────────────────────────────────────
  try {
    const { data, error } = await admin.from("profiles").select("id").is("username", null).limit(10);
    const count = data?.length ?? 0;
    results.push({ id: "profiles_username", category: "Daten-Integrität", name: "Profile ohne Username", status: error ? "error" : count > 0 ? "warn" : "ok", detail: count > 0 ? `${count} Profile ohne Username (max. 10 angezeigt)` : null });
  } catch (e) {
    results.push({ id: "profiles_username", category: "Daten-Integrität", name: "Profile ohne Username", status: "error", detail: String(e) });
  }

  // ── Temp bans: expired bans not cleared ────────────────────────────────────
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("id")
      .lt("temp_banned_until", new Date().toISOString())
      .not("temp_banned_until", "is", null)
      .limit(50);
    const count = data?.length ?? 0;
    results.push({ id: "expired_bans", category: "Daten-Integrität", name: "Abgelaufene Temp-Bans", status: error ? "error" : count > 0 ? "warn" : "ok", detail: count > 0 ? `${count} Profile noch mit abgelaufenem Ban in DB` : null });
  } catch (e) {
    results.push({ id: "expired_bans", category: "Daten-Integrität", name: "Abgelaufene Temp-Bans", status: "error", detail: String(e) });
  }

  // ── Auction: active listings past end_at ─────────────────────────────────
  try {
    const { data, error } = await admin
      .from("auctions")
      .select("id")
      .eq("status", "active")
      .lt("ends_at", new Date().toISOString())
      .limit(20);
    const count = data?.length ?? 0;
    results.push({ id: "stale_auctions", category: "Daten-Integrität", name: "Abgelaufene Auktionen (aktiv)", status: error ? "error" : count > 0 ? "warn" : "ok", detail: count > 0 ? `${count} Auktionen nach Ablaufzeit noch aktiv — cron ggf. nicht laufend` : null });
  } catch (e) {
    results.push({ id: "stale_auctions", category: "Daten-Integrität", name: "Abgelaufene Auktionen (aktiv)", status: "warn", detail: String(e) });
  }

  // ── debug_logs: count errors in last 24h ──────────────────────────────────
  try {
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error } = await admin
      .from("debug_logs")
      .select("*", { count: "exact", head: true })
      .eq("level", "error")
      .gte("created_at", since);
    results.push({ id: "recent_errors", category: "Fehler (24h)", name: "Error-Logs (letzten 24h)", status: error ? "warn" : (count ?? 0) > 0 ? "warn" : "ok", detail: (count ?? 0) > 0 ? `${count} Fehler in den letzten 24h — Debug-Log prüfen` : null });
  } catch (e) {
    results.push({ id: "recent_errors", category: "Fehler (24h)", name: "Error-Logs (letzten 24h)", status: "warn", detail: String(e) });
  }

  return results;
}
