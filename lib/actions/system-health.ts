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
    "case_tiers", "auction_listings", "trades", "audit_logs",
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
  ];
  for (const tbl of optionalTables) {
    try {
      const { error } = await admin.from(tbl).select("*").limit(0);
      results.push({ id: `table_opt_${tbl}`, category: "Optionale Tabellen", name: tbl, status: error ? "warn" : "ok", detail: error ? `Nicht vorhanden — Migration ausführen` : null });
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
  const envVars = [
    { key: "NEXT_PUBLIC_SUPABASE_URL", id: "env_sb_url" },
    { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY", id: "env_sb_anon" },
    { key: "SUPABASE_SERVICE_ROLE_KEY", id: "env_sb_service" },
  ];
  for (const ev of envVars) {
    const present = !!(process.env[ev.key]);
    results.push({ id: ev.id, category: "Umgebungsvariablen", name: ev.key, status: present ? "ok" : "error", detail: present ? null : `${ev.key} fehlt — App kann nicht mit Supabase verbinden` });
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
      .from("auction_listings")
      .select("id")
      .eq("status", "active")
      .lt("end_at", new Date().toISOString())
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
