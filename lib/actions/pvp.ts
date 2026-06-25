"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEquippedDamage, isWeaponType, computePvpDamage, capsuleHitTest } from "@/lib/combat";
import { getWorldSessionConfig } from "@/lib/actions/world-session";
import { getCharacterConfig } from "@/lib/actions/character-config";
import type { EquippedItem } from "@/lib/rarity-colors";

export interface AttemptPvpHitInput {
  targetUserId: string;
  /** Attacker's own position/heading exactly as their own client has it
   * right now — the same numbers their local melee scan (player.tsx)
   * already used to decide "did I swing at someone". */
  attackerX: number;
  attackerZ: number;
  attackerHeading: number;
  /** The target's position *as the attacker's own client currently renders
   * it* (components/world/remote-players.tsx's lerped avatar position) —
   * not fetched fresh server-side, since there is no server-authoritative
   * position store (lib/world-realtime.ts is fire-and-forget broadcast
   * only, nothing persists positions). This is "server-authoritative-
   * enough", not real anti-cheat — the same honesty lib/actions/
   * monsters.ts's claimMonsterKill already documents about itself. What
   * *is* fully server-authoritative here is the damage number: it's always
   * rolled from the attacker's actually-equipped weapon row, never from
   * anything the client claims about damage. */
  targetX: number;
  targetZ: number;
  sprinting: boolean;
  airborne: boolean;
}

export interface AttemptPvpHitResult {
  success: boolean;
  error?: string;
  hit?: boolean;
  damage?: number;
}

/** Same idea as MIN_KILL_INTERVAL_MS in lib/actions/monsters.ts — smaller
 * than ATTACK_COOLDOWN so it never blocks a genuine swing, just makes a
 * zero-delay scripted spam-loop against this action pointless. */
const MIN_PVP_HIT_INTERVAL_MS = 300;

export async function attemptPvpHit(input: AttemptPvpHitInput): Promise<AttemptPvpHitResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Du musst eingeloggt sein." };
  if (user.id === input.targetUserId) {
    return { success: false, error: "Du kannst dich nicht selbst treffen." };
  }

  // Admin Games tab master switch (lib/world-session-config.ts) — checked
  // here, not client-side, so it can't be bypassed by a client that just
  // doesn't bother checking it. Returns `hit: false` rather than an error
  // so the attacker's own swing/miss feedback still plays normally; it
  // just never lands on another player while this is off.
  const sessionConfig = await getWorldSessionConfig();
  if (!sessionConfig.pvpEnabled) return { success: true, hit: false };
  const characterConfig = await getCharacterConfig();

  const admin = createAdminClient();

  const { data: lastHit } = await admin
    .from("audit_logs")
    .select("created_at")
    .eq("user_id", user.id)
    .eq("action", "pvp_hit_attempt")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastHit && Date.now() - new Date(lastHit.created_at).getTime() < MIN_PVP_HIT_INTERVAL_MS) {
    return { success: false, error: "Zu schnell." };
  }

  const isHit = capsuleHitTest(
    input.attackerX,
    input.attackerZ,
    input.attackerHeading,
    input.targetX,
    input.targetZ,
    characterConfig.attackRange,
    characterConfig.attackHitRadius,
    characterConfig.attackConeHalfAngle
  );
  if (!isHit) return { success: true, hit: false };

  // Re-fetch the attacker's *currently equipped* weapon server-side — never
  // trust a client-supplied damage number, exactly the same rule
  // claimMonsterKill applies to monster rewards.
  const [{ data: inventory }, { data: attackerProfile }] = await Promise.all([
    admin
      .from("inventory")
      .select("item:items(damage, type)")
      .eq("user_id", user.id)
      .eq("equipped", true),
    admin
      .from("profiles")
      .select("equipped_ability_key")
      .eq("id", user.id)
      .single(),
  ]);
  const weaponRow = ((inventory ?? []) as unknown as { item: (EquippedItem & { type: string }) | null }[]).find(
    (row) => row.item && isWeaponType(row.item.type)
  );
  const baseDmg = getEquippedDamage(weaponRow?.item ?? null, characterConfig.fistDamage);
  // computePvpDamage (not the bare PvE momentum math) — see its doc
  // comment in lib/combat.ts for why PvP needs its own, separately
  // dampened damage curve: a flat 100-HP human target has none of the
  // per-tier HP headroom monsters are individually balanced around, so
  // applying raw weapon/momentum numbers here would let a single
  // sprint-jump hit from a top-tier weapon one-shot anyone outright.
  let damage = computePvpDamage(
    baseDmg,
    input.sprinting,
    input.airborne,
    characterConfig.sprintDamageMultiplier,
    characterConfig.airborneDamageMultiplier,
    characterConfig.pvpDamageMultiplier
  );

  // Apply world_damage_boost ability if attacker has one equipped
  const equippedKey = (attackerProfile?.equipped_ability_key as string | null) ?? null;
  if (equippedKey) {
    try {
      const { data: abilityDef } = await admin
        .from("ability_definitions")
        .select("effect_type, effect_value")
        .eq("key", equippedKey)
        .eq("enabled", true)
        .single();
      if (abilityDef?.effect_type === "world_damage_boost") {
        damage = Math.round(damage * (1 + (abilityDef.effect_value as number)));
      }
    } catch { /* non-fatal */ }
  }

  try {
    const { data: targetProfile } = await admin
      .from("profiles")
      .select("username")
      .eq("id", input.targetUserId)
      .single();
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "pvp_hit_attempt",
      payload: {
        targetUserId: input.targetUserId,
        targetUsername: (targetProfile?.username as string | null) ?? null,
        damage,
        abilityKey: equippedKey,
      },
    });
  } catch {
    // best-effort — the hit still lands below either way.
  }

  // Award XP for landing a PvP hit (fire-and-forget, non-blocking)
  try {
    const { awardXp, getXpConfig } = await import("@/lib/actions/level-system");
    const xpCfg = await getXpConfig();
    void awardXp(user.id, xpCfg.sources.pvp_kill ?? 15, "pvp_kill", `Schaden: ${damage} an ${input.targetUserId.slice(0, 8)}`);
  } catch { /* non-fatal */ }

  try {
    const { incrementBpQuestProgress } = await import("@/lib/actions/bp-quests");
    void incrementBpQuestProgress(user.id, "pvp_hit", 1);
  } catch { /* non-fatal */ }

  // Broadcast is now done client-side via broadcastPvpDamage (world-realtime.ts)
  // using the same httpSend path as every other game event — the REST broadcast
  // endpoint (lib/realtime-server.ts) was silently dropping these messages.
  // The damage is returned here so the attacker's client can relay it.
  return { success: true, hit: true, damage };
}
