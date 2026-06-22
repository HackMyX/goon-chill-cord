"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastToWorldRoom } from "@/lib/realtime-server";
import { WORLD_CHANNEL_NAME } from "@/lib/world-realtime";
import { getEquippedDamage, isWeaponType, momentumMultiplier, capsuleHitTest, ATTACK_RANGE } from "@/lib/combat";
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
    ATTACK_RANGE
  );
  if (!isHit) return { success: true, hit: false };

  // Re-fetch the attacker's *currently equipped* weapon server-side — never
  // trust a client-supplied damage number, exactly the same rule
  // claimMonsterKill applies to monster rewards.
  const { data: inventory } = await admin
    .from("inventory")
    .select("item:items(damage, type)")
    .eq("user_id", user.id)
    .eq("equipped", true);
  const weaponRow = ((inventory ?? []) as unknown as { item: (EquippedItem & { type: string }) | null }[]).find(
    (row) => row.item && isWeaponType(row.item.type)
  );
  const baseDmg = getEquippedDamage(weaponRow?.item ?? null);
  const damage = Math.round(baseDmg * momentumMultiplier(input.sprinting, input.airborne));

  try {
    await admin.from("audit_logs").insert({
      user_id: user.id,
      action: "pvp_hit_attempt",
      payload: { targetUserId: input.targetUserId, damage },
    });
  } catch {
    // best-effort — the hit still lands below either way.
  }

  await broadcastToWorldRoom(WORLD_CHANNEL_NAME, "pvp_damage", {
    targetUserId: input.targetUserId,
    attackerId: user.id,
    amount: damage,
  });

  return { success: true, hit: true, damage };
}
