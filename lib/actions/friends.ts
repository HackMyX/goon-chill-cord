"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { broadcastLive } from "@/lib/realtime-broadcast";
import { notifyUser } from "@/lib/notifications-internal";

/**
 * V-SOCIAL Phase 1 — Freundes-/Social-Netzwerk.
 *
 * Datenmodell:
 *  - friend_requests : ausstehende/erledigte Anfragen (status pending/accepted/declined/cancelled)
 *  - friendships     : EINE Zeile pro Richtung (A->B und B->A) → "meine Freunde" = 1 Index-Lookup;
 *                      `favorite` ist die per-Richtung-Anpinnung des Besitzers
 *  - blocked_users   : blocker_id -> blocked_id
 *
 * Online/Offline = ephemere Presence (Client, lib/presence-client.ts).
 * "zuletzt online" + "in-game" werden hier aus user_sessions abgeleitet
 * (last_ping / in_world) — KEINE neue profiles-Spalte.
 *
 * Alle Cross-User-Writes laufen über den Service-Role-Admin-Client; jede
 * betroffene Partei bekommt einen `friends:<uid>`-Broadcast, damit ihr Panel
 * sofort neu lädt (AGENTS §3).
 */

// In-world gilt nur als aktiv, wenn die Session-Bewegung frisch ist (vgl.
// Welt-Staleness-Despawn). last_ping älter → kein "in-game" mehr.
const IN_WORLD_FRESH_MS = 150_000; // 2.5 min

export type RelationshipKind =
  | "none"
  | "self"
  | "friends"
  | "incoming"   // der ANDERE hat MIR eine Anfrage geschickt
  | "outgoing"   // ICH habe dem anderen eine Anfrage geschickt
  | "blocked"    // ICH habe den anderen blockiert
  | "blocked_by"; // der andere hat MICH blockiert

export interface FriendSummary {
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  level: number;
  nameStyleKey: string | null;
  prioBadges: string[];
  favorite: boolean;
  /** ISO-String der letzten Aktivität (max last_ping über alle Sessions) oder null. */
  lastSeen: string | null;
  /** true wenn eine frische Session mit in_world existiert. */
  inWorld: boolean;
  friendsSince: string;
}

export interface PendingRequest {
  requestId: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  level: number;
  nameStyleKey: string | null;
  createdAt: string;
}

export interface BlockedSummary {
  userId: string;
  username: string;
  avatarUrl: string | null;
  blockedAt: string;
}

export interface FriendData {
  ok: boolean;
  error?: string;
  friends: FriendSummary[];
  incoming: PendingRequest[];
  outgoing: PendingRequest[];
  blocked: BlockedSummary[];
}

interface ActionResult {
  ok: boolean;
  error?: string;
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function getViewer() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

interface ProfileLite {
  id: string;
  username: string;
  avatar_url: string | null;
  role: string;
  level: number | null;
  active_name_style_key: string | null;
  prio_badges: string[] | null;
}

/** Lädt Mini-Profile für eine Menge von IDs, gemappt nach id. */
async function loadProfiles(admin: AdminClient, ids: string[]): Promise<Map<string, ProfileLite>> {
  const map = new Map<string, ProfileLite>();
  if (ids.length === 0) return map;
  const { data } = await admin
    .from("profiles")
    .select("id, username, avatar_url, role, level, active_name_style_key, prio_badges")
    .in("id", ids);
  for (const p of (data ?? []) as ProfileLite[]) map.set(p.id, p);
  return map;
}

/** Leitet { lastSeen, inWorld } pro User aus user_sessions ab. */
async function loadSessionStatus(
  admin: AdminClient,
  ids: string[],
): Promise<Map<string, { lastSeen: string | null; inWorld: boolean }>> {
  const map = new Map<string, { lastSeen: string | null; inWorld: boolean }>();
  if (ids.length === 0) return map;
  const { data } = await admin
    .from("user_sessions")
    .select("user_id, last_ping, in_world")
    .in("user_id", ids);
  const freshCut = Date.now() - IN_WORLD_FRESH_MS;
  for (const row of (data ?? []) as { user_id: string; last_ping: string | null; in_world: boolean | null }[]) {
    const cur = map.get(row.user_id) ?? { lastSeen: null, inWorld: false };
    const pingMs = row.last_ping ? new Date(row.last_ping).getTime() : 0;
    if (!cur.lastSeen || pingMs > new Date(cur.lastSeen).getTime()) cur.lastSeen = row.last_ping;
    if (row.in_world && pingMs >= freshCut) cur.inWorld = true;
    map.set(row.user_id, cur);
  }
  return map;
}

// ── Read ──────────────────────────────────────────────────────────────────────

const EMPTY: FriendData = { ok: false, friends: [], incoming: [], outgoing: [], blocked: [] };

/** Voller Social-Snapshot für das Topbar-Overlay. */
export async function getFriendData(): Promise<FriendData> {
  const me = await getViewer();
  if (!me) return { ...EMPTY, error: "Nicht eingeloggt." };
  const admin = createAdminClient();

  const [{ data: friendRows }, { data: reqRows }, { data: blockRows }] = await Promise.all([
    admin.from("friendships").select("friend_id, favorite, created_at").eq("user_id", me),
    admin
      .from("friend_requests")
      .select("id, from_user_id, to_user_id, created_at")
      .eq("status", "pending")
      .or(`from_user_id.eq.${me},to_user_id.eq.${me}`),
    admin.from("blocked_users").select("blocked_id, created_at").eq("blocker_id", me),
  ]);

  const friends = (friendRows ?? []) as { friend_id: string; favorite: boolean; created_at: string }[];
  const requests = (reqRows ?? []) as { id: string; from_user_id: string; to_user_id: string; created_at: string }[];
  const blocks = (blockRows ?? []) as { blocked_id: string; created_at: string }[];

  const incomingRaw = requests.filter((r) => r.to_user_id === me);
  const outgoingRaw = requests.filter((r) => r.from_user_id === me);

  // Alle relevanten IDs in einem Rutsch laden.
  const allIds = new Set<string>();
  friends.forEach((f) => allIds.add(f.friend_id));
  incomingRaw.forEach((r) => allIds.add(r.from_user_id));
  outgoingRaw.forEach((r) => allIds.add(r.to_user_id));
  blocks.forEach((b) => allIds.add(b.blocked_id));

  const [profiles, status] = await Promise.all([
    loadProfiles(admin, [...allIds]),
    loadSessionStatus(admin, friends.map((f) => f.friend_id)),
  ]);

  const summarizeFriend = (f: { friend_id: string; favorite: boolean; created_at: string }): FriendSummary | null => {
    const p = profiles.get(f.friend_id);
    if (!p) return null;
    const s = status.get(f.friend_id) ?? { lastSeen: null, inWorld: false };
    return {
      userId: p.id,
      username: p.username,
      avatarUrl: p.avatar_url,
      role: p.role,
      level: Number(p.level ?? 0),
      nameStyleKey: p.active_name_style_key,
      prioBadges: p.prio_badges ?? [],
      favorite: f.favorite,
      lastSeen: s.lastSeen,
      inWorld: s.inWorld,
      friendsSince: f.created_at,
    };
  };

  const mapRequest = (r: { id: string; from_user_id: string; to_user_id: string; created_at: string }, who: "from_user_id" | "to_user_id"): PendingRequest | null => {
    const p = profiles.get(r[who]);
    if (!p) return null;
    return {
      requestId: r.id,
      userId: p.id,
      username: p.username,
      avatarUrl: p.avatar_url,
      role: p.role,
      level: Number(p.level ?? 0),
      nameStyleKey: p.active_name_style_key,
      createdAt: r.created_at,
    };
  };

  const friendList = friends
    .map(summarizeFriend)
    .filter((x): x is FriendSummary => x !== null)
    .sort((a, b) => {
      if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
      if (a.inWorld !== b.inWorld) return a.inWorld ? -1 : 1;
      return a.username.localeCompare(b.username, "de");
    });

  return {
    ok: true,
    friends: friendList,
    incoming: incomingRaw
      .map((r) => mapRequest(r, "from_user_id"))
      .filter((x): x is PendingRequest => x !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    outgoing: outgoingRaw
      .map((r) => mapRequest(r, "to_user_id"))
      .filter((x): x is PendingRequest => x !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    blocked: blocks
      .map((b): BlockedSummary | null => {
        const p = profiles.get(b.blocked_id);
        if (!p) return null;
        return { userId: p.id, username: p.username, avatarUrl: p.avatar_url, blockedAt: b.created_at };
      })
      .filter((x): x is BlockedSummary => x !== null),
  };
}

/** Beziehung des Viewers zu einem Ziel-User — treibt den Button im Profil-Popup. */
export async function getRelationshipTo(
  targetUserId: string,
): Promise<{ ok: boolean; kind: RelationshipKind; requestId?: string; error?: string }> {
  const me = await getViewer();
  if (!me) return { ok: false, kind: "none", error: "Nicht eingeloggt." };
  if (me === targetUserId) return { ok: true, kind: "self" };
  const admin = createAdminClient();

  const [{ data: fs }, { data: blockMine }, { data: blockTheirs }, { data: req }] = await Promise.all([
    admin.from("friendships").select("user_id").eq("user_id", me).eq("friend_id", targetUserId).maybeSingle(),
    admin.from("blocked_users").select("id").eq("blocker_id", me).eq("blocked_id", targetUserId).maybeSingle(),
    admin.from("blocked_users").select("id").eq("blocker_id", targetUserId).eq("blocked_id", me).maybeSingle(),
    admin
      .from("friend_requests")
      .select("id, from_user_id, to_user_id")
      .eq("status", "pending")
      .or(`and(from_user_id.eq.${me},to_user_id.eq.${targetUserId}),and(from_user_id.eq.${targetUserId},to_user_id.eq.${me})`)
      .maybeSingle(),
  ]);

  if (fs) return { ok: true, kind: "friends" };
  if (blockMine) return { ok: true, kind: "blocked" };
  if (blockTheirs) return { ok: true, kind: "blocked_by" };
  if (req) {
    const r = req as { id: string; from_user_id: string; to_user_id: string };
    return { ok: true, kind: r.from_user_id === me ? "outgoing" : "incoming", requestId: r.id };
  }
  return { ok: true, kind: "none" };
}

// ── Mutations ──────────────────────────────────────────────────────────────────

export async function sendFriendRequest(targetUserId: string): Promise<ActionResult> {
  const me = await getViewer();
  if (!me) return { ok: false, error: "Nicht eingeloggt." };
  if (me === targetUserId) return { ok: false, error: "Du kannst dir nicht selbst eine Anfrage schicken." };
  const admin = createAdminClient();

  const { data: target } = await admin.from("profiles").select("id, username, accept_friend_requests").eq("id", targetUserId).maybeSingle();
  if (!target) return { ok: false, error: "Nutzer nicht gefunden." };
  if ((target as { accept_friend_requests?: boolean | null }).accept_friend_requests === false) {
    return { ok: false, error: "Dieser Spieler nimmt keine Freundschaftsanfragen an." };
  }

  // Block in beide Richtungen?
  const { data: block } = await admin
    .from("blocked_users")
    .select("blocker_id")
    .or(`and(blocker_id.eq.${me},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${me})`)
    .maybeSingle();
  if (block) return { ok: false, error: "Anfrage nicht möglich (Blockierung aktiv)." };

  // Schon befreundet?
  const { data: existing } = await admin
    .from("friendships").select("user_id").eq("user_id", me).eq("friend_id", targetUserId).maybeSingle();
  if (existing) return { ok: false, error: "Ihr seid bereits befreundet." };

  // Gegen-Anfrage offen? → direkt akzeptieren (beidseitiger Wunsch).
  const { data: reverse } = await admin
    .from("friend_requests").select("id")
    .eq("from_user_id", targetUserId).eq("to_user_id", me).eq("status", "pending").maybeSingle();
  if (reverse) return acceptRequestInternal(admin, (reverse as { id: string }).id, me);

  const { error } = await admin
    .from("friend_requests")
    .insert({ from_user_id: me, to_user_id: targetUserId, status: "pending" });
  if (error) {
    // Partial-Unique-Index → es gibt schon eine offene Anfrage.
    if (error.code === "23505") return { ok: false, error: "Anfrage läuft bereits." };
    return { ok: false, error: "Anfrage fehlgeschlagen." };
  }

  const { data: meProfile } = await admin.from("profiles").select("username").eq("id", me).maybeSingle();
  const myName = (meProfile as { username?: string } | null)?.username ?? "Jemand";
  await notifyUser({
    userId: targetUserId,
    type: "friend_request",
    title: "Neue Freundschaftsanfrage",
    message: `${myName} möchte dich als Freund hinzufügen.`,
    link: "/friends#requests",
  });
  await Promise.all([broadcastLive(`friends:${me}`), broadcastLive(`friends:${targetUserId}`)]);
  return { ok: true };
}

/** Gemeinsame Annahme-Logik (zwei Friendship-Zeilen + Request schließen). */
async function acceptRequestInternal(admin: AdminClient, requestId: string, me: string): Promise<ActionResult> {
  const { data: req } = await admin
    .from("friend_requests")
    .select("id, from_user_id, to_user_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Anfrage nicht gefunden." };
  const r = req as { id: string; from_user_id: string; to_user_id: string; status: string };
  if (r.to_user_id !== me) return { ok: false, error: "Diese Anfrage gehört nicht dir." };
  if (r.status !== "pending") return { ok: false, error: "Anfrage ist nicht mehr offen." };

  await admin.from("friend_requests").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", requestId);
  // Beide Richtungen anlegen (idempotent via UNIQUE → upsert ignoriert Dubletten).
  await admin.from("friendships").upsert(
    [
      { user_id: r.from_user_id, friend_id: r.to_user_id },
      { user_id: r.to_user_id, friend_id: r.from_user_id },
    ],
    { onConflict: "user_id,friend_id", ignoreDuplicates: true },
  );

  const { data: meProfile } = await admin.from("profiles").select("username").eq("id", me).maybeSingle();
  const myName = (meProfile as { username?: string } | null)?.username ?? "Jemand";
  await notifyUser({
    userId: r.from_user_id,
    type: "friend_accepted",
    title: "Freundschaft bestätigt",
    message: `${myName} hat deine Freundschaftsanfrage angenommen.`,
    link: "/friends",
  });
  await Promise.all([broadcastLive(`friends:${r.from_user_id}`), broadcastLive(`friends:${r.to_user_id}`)]);
  return { ok: true };
}

export async function respondFriendRequest(requestId: string, accept: boolean): Promise<ActionResult> {
  const me = await getViewer();
  if (!me) return { ok: false, error: "Nicht eingeloggt." };
  const admin = createAdminClient();

  if (accept) return acceptRequestInternal(admin, requestId, me);

  const { data: req } = await admin
    .from("friend_requests").select("id, to_user_id, from_user_id, status").eq("id", requestId).maybeSingle();
  if (!req) return { ok: false, error: "Anfrage nicht gefunden." };
  const r = req as { id: string; to_user_id: string; from_user_id: string; status: string };
  if (r.to_user_id !== me) return { ok: false, error: "Diese Anfrage gehört nicht dir." };
  if (r.status !== "pending") return { ok: false, error: "Anfrage ist nicht mehr offen." };

  await admin.from("friend_requests").update({ status: "declined", responded_at: new Date().toISOString() }).eq("id", requestId);
  await Promise.all([broadcastLive(`friends:${r.from_user_id}`), broadcastLive(`friends:${r.to_user_id}`)]);
  return { ok: true };
}

export async function cancelFriendRequest(requestId: string): Promise<ActionResult> {
  const me = await getViewer();
  if (!me) return { ok: false, error: "Nicht eingeloggt." };
  const admin = createAdminClient();

  const { data: req } = await admin
    .from("friend_requests").select("id, from_user_id, to_user_id, status").eq("id", requestId).maybeSingle();
  if (!req) return { ok: false, error: "Anfrage nicht gefunden." };
  const r = req as { id: string; from_user_id: string; to_user_id: string; status: string };
  if (r.from_user_id !== me) return { ok: false, error: "Du kannst nur eigene Anfragen zurückziehen." };
  if (r.status !== "pending") return { ok: false, error: "Anfrage ist nicht mehr offen." };

  await admin.from("friend_requests").update({ status: "cancelled", responded_at: new Date().toISOString() }).eq("id", requestId);
  await Promise.all([broadcastLive(`friends:${r.from_user_id}`), broadcastLive(`friends:${r.to_user_id}`)]);
  return { ok: true };
}

export async function removeFriend(friendId: string): Promise<ActionResult> {
  const me = await getViewer();
  if (!me) return { ok: false, error: "Nicht eingeloggt." };
  const admin = createAdminClient();

  await admin.from("friendships").delete().or(
    `and(user_id.eq.${me},friend_id.eq.${friendId}),and(user_id.eq.${friendId},friend_id.eq.${me})`,
  );
  await Promise.all([broadcastLive(`friends:${me}`), broadcastLive(`friends:${friendId}`)]);
  return { ok: true };
}

export async function toggleFavorite(friendId: string): Promise<ActionResult> {
  const me = await getViewer();
  if (!me) return { ok: false, error: "Nicht eingeloggt." };
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("friendships").select("favorite").eq("user_id", me).eq("friend_id", friendId).maybeSingle();
  if (!row) return { ok: false, error: "Nicht in deiner Freundesliste." };
  await admin
    .from("friendships")
    .update({ favorite: !(row as { favorite: boolean }).favorite })
    .eq("user_id", me)
    .eq("friend_id", friendId);
  await broadcastLive(`friends:${me}`);
  return { ok: true };
}

export async function blockUser(targetUserId: string): Promise<ActionResult> {
  const me = await getViewer();
  if (!me) return { ok: false, error: "Nicht eingeloggt." };
  if (me === targetUserId) return { ok: false, error: "Du kannst dich nicht selbst blockieren." };
  const admin = createAdminClient();

  const { data: target } = await admin.from("profiles").select("id").eq("id", targetUserId).maybeSingle();
  if (!target) return { ok: false, error: "Nutzer nicht gefunden." };

  // Blockieren entfernt Freundschaft + offene Anfragen in beide Richtungen.
  await admin.from("friendships").delete().or(
    `and(user_id.eq.${me},friend_id.eq.${targetUserId}),and(user_id.eq.${targetUserId},friend_id.eq.${me})`,
  );
  await admin.from("friend_requests")
    .update({ status: "cancelled", responded_at: new Date().toISOString() })
    .eq("status", "pending")
    .or(`and(from_user_id.eq.${me},to_user_id.eq.${targetUserId}),and(from_user_id.eq.${targetUserId},to_user_id.eq.${me})`);
  await admin.from("blocked_users").upsert(
    { blocker_id: me, blocked_id: targetUserId },
    { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true },
  );
  await Promise.all([broadcastLive(`friends:${me}`), broadcastLive(`friends:${targetUserId}`)]);
  return { ok: true };
}

export async function unblockUser(targetUserId: string): Promise<ActionResult> {
  const me = await getViewer();
  if (!me) return { ok: false, error: "Nicht eingeloggt." };
  const admin = createAdminClient();
  await admin.from("blocked_users").delete().eq("blocker_id", me).eq("blocked_id", targetUserId);
  await broadcastLive(`friends:${me}`);
  return { ok: true };
}

// ── Spieler-Suche (Freunde-Seite) ───────────────────────────────────────────────

/** Beziehungs-Status eines Suchtreffers (ohne "self" — Self ist ausgeschlossen). */
export type AddableRelationship =
  | "none"
  | "friends"
  | "incoming"   // der Treffer hat MIR eine Anfrage geschickt
  | "outgoing"   // ICH habe dem Treffer eine Anfrage geschickt
  | "blocked"    // ICH habe den Treffer blockiert
  | "blocked_by"; // der Treffer hat MICH blockiert

export interface AddableUserResult {
  id: string;
  username: string;
  avatarUrl: string | null;
  relationship: AddableRelationship;
  /** Nur bei relationship === "incoming" gesetzt — für respondFriendRequest(). */
  requestId?: string;
}

/**
 * Sucht hinzufügbare Spieler per Username (case-insensitive Teiltreffer) und
 * bestimmt die Beziehung des Viewers zu jedem Treffer in EINEM Batch
 * (keine N+1-Queries). Self wird ausgeschlossen, leere/kurze Query → [].
 */
export async function searchAddableUsers(query: string): Promise<AddableUserResult[]> {
  const me = await getViewer();
  if (!me) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const admin = createAdminClient();

  // ilike-Wildcards im User-Input neutralisieren, Teiltreffer selbst anhängen.
  const safe = q.replace(/[\\%_]/g, (m) => `\\${m}`);
  const { data: rows } = await admin
    .from("profiles")
    .select("id, username, avatar_url")
    .ilike("username", `%${safe}%`)
    .neq("id", me)
    .limit(20);

  const candidates = (rows ?? []) as { id: string; username: string; avatar_url: string | null }[];
  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.id);
  const idList = ids.join(",");

  const [{ data: friendRows }, { data: blockMine }, { data: blockTheirs }, { data: reqRows }] =
    await Promise.all([
      admin.from("friendships").select("friend_id").eq("user_id", me).in("friend_id", ids),
      admin.from("blocked_users").select("blocked_id").eq("blocker_id", me).in("blocked_id", ids),
      admin.from("blocked_users").select("blocker_id").eq("blocked_id", me).in("blocker_id", ids),
      admin
        .from("friend_requests")
        .select("id, from_user_id, to_user_id")
        .eq("status", "pending")
        .or(
          `and(from_user_id.eq.${me},to_user_id.in.(${idList})),and(to_user_id.eq.${me},from_user_id.in.(${idList}))`,
        ),
    ]);

  const friendSet = new Set((friendRows ?? []).map((r) => (r as { friend_id: string }).friend_id));
  const blockedSet = new Set((blockMine ?? []).map((r) => (r as { blocked_id: string }).blocked_id));
  const blockedBySet = new Set((blockTheirs ?? []).map((r) => (r as { blocker_id: string }).blocker_id));
  const outgoingSet = new Set<string>();
  const incomingReq = new Map<string, string>(); // from_user_id → requestId
  for (const r of (reqRows ?? []) as { id: string; from_user_id: string; to_user_id: string }[]) {
    if (r.from_user_id === me) outgoingSet.add(r.to_user_id);
    else if (r.to_user_id === me) incomingReq.set(r.from_user_id, r.id);
  }

  return candidates.map((c): AddableUserResult => {
    let relationship: AddableRelationship = "none";
    let requestId: string | undefined;
    if (friendSet.has(c.id)) relationship = "friends";
    else if (blockedSet.has(c.id)) relationship = "blocked";
    else if (blockedBySet.has(c.id)) relationship = "blocked_by";
    else if (outgoingSet.has(c.id)) relationship = "outgoing";
    else if (incomingReq.has(c.id)) {
      relationship = "incoming";
      requestId = incomingReq.get(c.id);
    }
    return { id: c.id, username: c.username, avatarUrl: c.avatar_url, relationship, requestId };
  });
}

// ── Admin-Übersicht (read-only) ─────────────────────────────────────────────────

export type FriendRequestStatus = "pending" | "accepted" | "declined" | "cancelled";

export interface AdminFriendRequest {
  id: string;
  fromUsername: string;
  toUsername: string;
  status: FriendRequestStatus;
  createdAt: string;
  respondedAt: string | null;
}

export interface AdminFriendBlock {
  blockerUsername: string;
  blockedUsername: string;
  createdAt: string;
}

export interface FriendsAdminData {
  stats: { friendships: number; pending: number; blocks: number };
  requests: AdminFriendRequest[];
  blocks: AdminFriendBlock[];
}

const EMPTY_ADMIN: FriendsAdminData = {
  stats: { friendships: 0, pending: 0, blocks: 0 },
  requests: [],
  blocks: [],
};

/**
 * Read-only Snapshot des Freunde-Systems für den Admin-Tab "Freunde".
 * Liefert bei fehlender Admin-Berechtigung ein leeres Resultat (kein Throw).
 */
export async function getFriendsAdminData(): Promise<FriendsAdminData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return EMPTY_ADMIN;
  const { data: profile } = await supabase
    .from("profiles").select("username, role").eq("id", user.id).single();
  if (!isAdmin(profile)) return EMPTY_ADMIN;

  const admin = createAdminClient();

  const [
    { count: friendshipRows },
    { count: pendingCount },
    { count: blockCount },
    { data: reqRows },
    { data: blockRows },
  ] = await Promise.all([
    admin.from("friendships").select("id", { count: "exact", head: true }),
    admin.from("friend_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    admin.from("blocked_users").select("id", { count: "exact", head: true }),
    admin
      .from("friend_requests")
      .select("id, from_user_id, to_user_id, status, created_at, responded_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("blocked_users")
      .select("blocker_id, blocked_id, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const requests = (reqRows ?? []) as {
    id: string;
    from_user_id: string;
    to_user_id: string;
    status: string;
    created_at: string;
    responded_at: string | null;
  }[];
  const blocks = (blockRows ?? []) as {
    blocker_id: string;
    blocked_id: string;
    created_at: string;
  }[];

  // Alle beteiligten IDs in EINEM profiles-Select auflösen (id → username).
  const ids = new Set<string>();
  requests.forEach((r) => { ids.add(r.from_user_id); ids.add(r.to_user_id); });
  blocks.forEach((b) => { ids.add(b.blocker_id); ids.add(b.blocked_id); });

  const nameMap = new Map<string, string>();
  if (ids.size > 0) {
    const { data: profs } = await admin.from("profiles").select("id, username").in("id", [...ids]);
    for (const p of (profs ?? []) as { id: string; username: string }[]) nameMap.set(p.id, p.username);
  }
  const nameOf = (id: string) => nameMap.get(id) ?? `${id.slice(0, 8)}…`;

  return {
    stats: {
      friendships: Math.floor((friendshipRows ?? 0) / 2),
      pending: pendingCount ?? 0,
      blocks: blockCount ?? 0,
    },
    requests: requests.map((r) => ({
      id: r.id,
      fromUsername: nameOf(r.from_user_id),
      toUsername: nameOf(r.to_user_id),
      status: r.status as FriendRequestStatus,
      createdAt: r.created_at,
      respondedAt: r.responded_at,
    })),
    blocks: blocks.map((b) => ({
      blockerUsername: nameOf(b.blocker_id),
      blockedUsername: nameOf(b.blocked_id),
      createdAt: b.created_at,
    })),
  };
}
