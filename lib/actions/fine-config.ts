"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";
import { type FineConfig, DEFAULT_FINE_CONFIG } from "@/lib/fine-config-types";
import { logActivity, logDebugEvent } from "@/lib/debug-log-server";

function rowToConfig(row: Record<string, unknown>): FineConfig {
  const n = (key: string, fallback: number) => {
    const v = row[key];
    return v !== null && v !== undefined ? Number(v) : fallback;
  };
  return {
    id: "default",
    nametagDistanceFactor:     n("nametag_distance_factor",     DEFAULT_FINE_CONFIG.nametagDistanceFactor),
    nametagHeightOffset:       n("nametag_height_offset",       DEFAULT_FINE_CONFIG.nametagHeightOffset),
    mpPositionLerpRate:        n("mp_position_lerp_rate",       DEFAULT_FINE_CONFIG.mpPositionLerpRate),
    mpHeadingTurnRate:         n("mp_heading_turn_rate",        DEFAULT_FINE_CONFIG.mpHeadingTurnRate),
    mpDeadReckoningLookahead:  n("mp_dead_reckoning_lookahead", DEFAULT_FINE_CONFIG.mpDeadReckoningLookahead),
    mpAttackSwingDuration:     n("mp_attack_swing_duration",    DEFAULT_FINE_CONFIG.mpAttackSwingDuration),
    bloodBurstParticleCount:   n("blood_burst_particle_count",  DEFAULT_FINE_CONFIG.bloodBurstParticleCount),
    bloodBurstLifetimeMs:      n("blood_burst_lifetime_ms",     DEFAULT_FINE_CONFIG.bloodBurstLifetimeMs),
    slashLifetimeMs:           n("slash_lifetime_ms",           DEFAULT_FINE_CONFIG.slashLifetimeMs),
    chatMaxHistory:            n("chat_max_history",            DEFAULT_FINE_CONFIG.chatMaxHistory),
    chatMaxMessageLength:      n("chat_max_message_length",     DEFAULT_FINE_CONFIG.chatMaxMessageLength),
    chatPollIntervalMs:        n("chat_poll_interval_ms",       DEFAULT_FINE_CONFIG.chatPollIntervalMs),
    communityMaxBadgesShown:   n("community_max_badges_shown",  DEFAULT_FINE_CONFIG.communityMaxBadgesShown),
    updatedAt: (row.updated_at as string) ?? null,
  };
}

export async function getFineConfig(): Promise<FineConfig> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("fine_config")
      .select("*")
      .eq("id", "default")
      .single();
    return data ? rowToConfig(data as Record<string, unknown>) : DEFAULT_FINE_CONFIG;
  } catch {
    return DEFAULT_FINE_CONFIG;
  }
}

export async function updateFineConfig(
  partial: Partial<Omit<FineConfig, "id" | "updatedAt">>
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nicht eingeloggt." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!isAdmin(profile)) return { error: "Keine Admin-Rechte." };

  const admin = createAdminClient();
  const dbRow: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (partial.nametagDistanceFactor     !== undefined) dbRow.nametag_distance_factor     = partial.nametagDistanceFactor;
  if (partial.nametagHeightOffset       !== undefined) dbRow.nametag_height_offset       = partial.nametagHeightOffset;
  if (partial.mpPositionLerpRate        !== undefined) dbRow.mp_position_lerp_rate       = partial.mpPositionLerpRate;
  if (partial.mpHeadingTurnRate         !== undefined) dbRow.mp_heading_turn_rate        = partial.mpHeadingTurnRate;
  if (partial.mpDeadReckoningLookahead  !== undefined) dbRow.mp_dead_reckoning_lookahead = partial.mpDeadReckoningLookahead;
  if (partial.mpAttackSwingDuration     !== undefined) dbRow.mp_attack_swing_duration    = partial.mpAttackSwingDuration;
  if (partial.bloodBurstParticleCount   !== undefined) dbRow.blood_burst_particle_count  = partial.bloodBurstParticleCount;
  if (partial.bloodBurstLifetimeMs      !== undefined) dbRow.blood_burst_lifetime_ms     = partial.bloodBurstLifetimeMs;
  if (partial.slashLifetimeMs           !== undefined) dbRow.slash_lifetime_ms           = partial.slashLifetimeMs;
  if (partial.chatMaxHistory            !== undefined) dbRow.chat_max_history            = partial.chatMaxHistory;
  if (partial.chatMaxMessageLength      !== undefined) dbRow.chat_max_message_length     = partial.chatMaxMessageLength;
  if (partial.chatPollIntervalMs        !== undefined) dbRow.chat_poll_interval_ms       = partial.chatPollIntervalMs;
  if (partial.communityMaxBadgesShown   !== undefined) dbRow.community_max_badges_shown  = partial.communityMaxBadgesShown;

  const { error } = await admin
    .from("fine_config")
    .upsert({ id: "default", ...dbRow });
  if (error) {
    void logDebugEvent({ level: "error", scope: "admin:fine-config", message: "Feintuning-Config Speichern fehlgeschlagen", detail: error.message, context: { userId: user.id } });
    return { error: error.message };
  }
  void logActivity("admin:fine-config", `Feintuning-Config gespeichert (${Object.keys(partial).length} Felder)`, { userId: user.id, fields: Object.keys(partial) });
  return { ok: true };
}
