"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { banDevicesForUser } from "@/lib/actions/fingerprint";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("username, role").eq("id", user.id).single();
  return isAdmin(profile) ? user : null;
}

export interface LoginEventRow {
  id: string;
  user_id: string;
  ip_address: string;
  user_agent: string | null;
  created_at: string;
  username?: string;
}

export interface DuplicateIpRow {
  ip_address: string;
  user_count: number;
  user_ids: string[];
  last_seen: string;
  usernames?: string[];
}

export interface IgnoreGroupEntry {
  id: string;
  userIds: string[];
  usernames: (string | null)[];
  reason: string | null;
  createdAt: string;
}

export interface SecurityStats {
  loginsLast24h: number;
  loginsLast7d: number;
  uniqueIpsLast7d: number;
  duplicateIpCount: number;
  ignoredCount: number;
}

export interface SecurityDataResult {
  success: boolean;
  error?: string;
  recentLogins?: LoginEventRow[];
  duplicateIps?: DuplicateIpRow[];
  ignoredDuplicateIps?: DuplicateIpRow[];
  ignoreList?: IgnoreGroupEntry[];
  stats?: SecurityStats;
}

export async function getSecurityData(): Promise<SecurityDataResult> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();

  const [
    { data: events, error: eventsErr },
    { data: ignoreRows },
  ] = await Promise.all([
    admin
      .from("login_events")
      .select("id, user_id, ip_address, user_agent, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    admin
      .from("ip_duplicate_ignore")
      .select("id, user_ids, reason, created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (eventsErr) {
    return { success: false, error: "login_events Tabelle nicht gefunden — Migration ausstehend." };
  }

  // Resolve usernames for all user IDs seen in events + ignore list
  const uniqueUserIds = [
    ...new Set([
      ...(events ?? []).map((e) => e.user_id).filter(Boolean),
      ...(ignoreRows ?? []).flatMap((r) => r.user_ids as string[]),
    ]),
  ];
  const { data: profileRows } = uniqueUserIds.length > 0
    ? await admin.from("profiles").select("id, username").in("id", uniqueUserIds)
    : { data: [] };
  const usernameMap = new Map((profileRows ?? []).map((p) => [p.id, p.username as string | null]));

  const recentLogins: LoginEventRow[] = (events ?? []).map((e) => ({
    ...e,
    username: usernameMap.get(e.user_id) ?? "Unbekannt",
  }));

  // Build ignore groups as sets for fast membership checks
  const ignoreGroups: Set<string>[] = (ignoreRows ?? []).map(
    (r) => new Set(r.user_ids as string[])
  );

  // Resolved ignore list for display
  const ignoreList: IgnoreGroupEntry[] = (ignoreRows ?? []).map((r) => ({
    id: r.id as string,
    userIds: r.user_ids as string[],
    usernames: (r.user_ids as string[]).map((id) => usernameMap.get(id) ?? null),
    reason: r.reason as string | null,
    createdAt: r.created_at as string,
  }));

  // Duplicate IPs: IPs used by 2+ different accounts
  const ipUserMap = new Map<string, Set<string>>();
  const ipLastSeen = new Map<string, string>();
  for (const e of events ?? []) {
    if (!e.ip_address || e.ip_address === "unknown") continue;
    if (!ipUserMap.has(e.ip_address)) ipUserMap.set(e.ip_address, new Set());
    ipUserMap.get(e.ip_address)!.add(e.user_id);
    if (!ipLastSeen.has(e.ip_address) || e.created_at > ipLastSeen.get(e.ip_address)!) {
      ipLastSeen.set(e.ip_address, e.created_at);
    }
  }

  // A duplicate IP group is "ignored" if ALL its users are contained within
  // a single ignore entry — e.g. two brothers' accounts are both in the group.
  function isGroupIgnored(userIds: string[]): boolean {
    return ignoreGroups.some((group) => userIds.every((id) => group.has(id)));
  }

  const duplicateIps: DuplicateIpRow[] = [];
  const ignoredDuplicateIps: DuplicateIpRow[] = [];

  for (const [ip, userIds] of ipUserMap.entries()) {
    if (userIds.size < 2) continue;
    const ids = [...userIds];
    const row: DuplicateIpRow = {
      ip_address: ip,
      user_count: ids.length,
      user_ids: ids,
      last_seen: ipLastSeen.get(ip) ?? "",
      usernames: ids.map((id) => usernameMap.get(id) ?? id.slice(0, 8)),
    };
    if (isGroupIgnored(ids)) {
      ignoredDuplicateIps.push(row);
    } else {
      duplicateIps.push(row);
    }
  }

  duplicateIps.sort((a, b) => b.user_count - a.user_count || b.last_seen.localeCompare(a.last_seen));
  ignoredDuplicateIps.sort((a, b) => b.user_count - a.user_count || b.last_seen.localeCompare(a.last_seen));

  // Stats
  const now = Date.now();
  const ms24h = 24 * 60 * 60 * 1000;
  const ms7d = 7 * ms24h;
  const all = events ?? [];
  const loginsLast24h = all.filter((e) => now - new Date(e.created_at).getTime() < ms24h).length;
  const loginsLast7d = all.filter((e) => now - new Date(e.created_at).getTime() < ms7d).length;
  const ipsLast7d = new Set(
    all.filter((e) => now - new Date(e.created_at).getTime() < ms7d && e.ip_address !== "unknown")
      .map((e) => e.ip_address)
  );

  return {
    success: true,
    recentLogins,
    duplicateIps,
    ignoredDuplicateIps,
    ignoreList,
    stats: {
      loginsLast24h,
      loginsLast7d,
      uniqueIpsLast7d: ipsLast7d.size,
      duplicateIpCount: duplicateIps.length,
      ignoredCount: ignoredDuplicateIps.length,
    },
  };
}

export async function addIpIgnoreGroup(
  userIds: string[],
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  if (!userIds || userIds.length < 2) return { success: false, error: "Mindestens 2 User-IDs erforderlich." };

  const admin = createAdminClient();
  const { error } = await admin.from("ip_duplicate_ignore").insert({
    user_ids: userIds,
    reason: reason?.trim() || null,
    created_by: user.id,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removeIpIgnoreGroup(
  entryId: string
): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };

  const admin = createAdminClient();
  const { error } = await admin.from("ip_duplicate_ignore").delete().eq("id", entryId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function banUserById(targetUserId: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireAdmin();
  if (!user) return { success: false, error: "Kein Zugriff." };
  if (targetUserId === user.id) return { success: false, error: "Du kannst dich nicht selbst bannen." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(targetUserId, {
    ban_duration: "876000h",
  });
  if (error) return { success: false, error: "Ban fehlgeschlagen." };

  await banDevicesForUser(targetUserId, user.id);

  return { success: true };
}
