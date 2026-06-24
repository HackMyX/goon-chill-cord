"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ScrollText, Coins, Users, Package, Flame, Store, Skull, PawPrint, Gamepad2, Palette, MessageCircle, Bug, Database, ShieldAlert, Shield, Search, FileText } from "lucide-react";
import { TopBar } from "@/components/layout/top-bar";
import { CaseTierEditor } from "@/components/admin/case-tier-editor";
import { UserRowEditor } from "@/components/admin/user-row-editor";
import { ItemsTab } from "@/components/admin/items-tab";
import { AuditTimeline } from "@/components/admin/audit-timeline";
import { StreakConfigEditor } from "@/components/admin/streak-config-editor";
import { ShopTab } from "@/components/admin/shop-tab";
import { MonsterTypeEditor } from "@/components/admin/monster-type-editor";
import { PetConfigEditor } from "@/components/admin/pet-config-editor";
import { KillStreakConfigEditor } from "@/components/admin/kill-streak-config-editor";
import { GamesTab } from "@/components/admin/games-tab";
import { SiteConfigEditor } from "@/components/admin/site-config-editor";
import { TicketsTab } from "@/components/admin/tickets-tab";
import { DebugLogTab } from "@/components/admin/debug-log-tab";
import { BackupTab } from "@/components/admin/backup-tab";
import { SecurityTab } from "@/components/admin/security-tab";
import { ModConfigEditor } from "@/components/admin/mod-config-editor";
import { PatchNotesEditor } from "@/components/admin/patchnotes-editor";
import type { PatchNote } from "@/lib/patchnotes";
import type { DonConfig } from "@/lib/don-config";
import type { SnakeConfig } from "@/lib/snake-config";
import type { MineConfig } from "@/lib/mine-config";
import type { ModPermissions } from "@/lib/mod";
import { useSoundManager } from "@/lib/sound-manager";
import type { Rarity } from "@/lib/cases";
import type { StreakConfig } from "@/lib/streak";
import type { ShopSettings } from "@/lib/shop";
import type { AdminShopListing } from "@/lib/actions/shop";
import type { MonsterTypeConfig } from "@/lib/monsters";
import type { PetTypeConfig } from "@/lib/pets";
import type { KillStreakConfig } from "@/lib/kill-streak";
import type { WorldSessionConfig } from "@/lib/world-session-config";
import type { CharacterConfig } from "@/lib/character-config";
import type { WorldSpawnConfig } from "@/lib/world-spawn-config";
import type { SiteConfig } from "@/lib/site-config";
import { useRealtimeProfile } from "@/lib/use-realtime-profile";
import { createClient } from "@/lib/supabase/client";

export interface AuditLogEntry {
  id: string;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  profiles: { username: string } | null;
}

export interface CaseTierRow {
  id: string;
  group_id: string;
  label: string;
  price: number;
  rarity_weights: Partial<Record<Rarity, number>>;
  enabled: boolean;
  item_types: string[] | null;
  item_ids: string[] | null;
  group_label: string | null;
  group_subtitle: string | null;
  preview_cost: number | null;
  multi_open_max: number | null;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  username: string;
  credits: number;
  role: string;
  cases_opened: number;
  support_banned?: boolean;
}

export interface ItemRow {
  id: string;
  name: string;
  rarity: Rarity;
  type: string;
  price_cr: number;
  damage: number | null;
  armor: number;
  perk_type: "none" | "speed_boost" | "jump_boost" | "hp_regen_boost";
  perk_magnitude: number;
  shield_hp: number;
  shield_regen_cooldown_sec: number;
}

interface AdminShellProps {
  credits: number;
  streakDays: number;
  auditLog: AuditLogEntry[];
  caseTiers: CaseTierRow[];
  profiles: ProfileRow[];
  items: ItemRow[];
  streakConfig: StreakConfig;
  shopSettings: ShopSettings;
  todayShopListings: AdminShopListing[];
  tomorrowShopListings: AdminShopListing[];
  monsterTypes: MonsterTypeConfig[];
  petTypes: PetTypeConfig[];
  killStreakConfig: KillStreakConfig;
  worldSessionConfig: WorldSessionConfig;
  characterConfig: CharacterConfig;
  worldSpawnConfig: WorldSpawnConfig;
  siteConfig: SiteConfig;
  modPermissions: ModPermissions;
  patchNotes: PatchNote[];
  donConfig: DonConfig;
  snakeConfig: SnakeConfig;
  mineConfig: MineConfig;
}

type Tab = "economy" | "streak" | "shop" | "users" | "items" | "monsters" | "pets" | "games" | "branding" | "audit" | "tickets" | "moderators" | "debug" | "backup" | "security" | "patchnotes";

const TABS: { id: Tab; label: string; icon: typeof Coins }[] = [
  { id: "economy", label: "Economy & Cases", icon: Coins },
  { id: "streak", label: "Daily-Streak", icon: Flame },
  { id: "shop", label: "Shop", icon: Store },
  { id: "users", label: "User-Management", icon: Users },
  { id: "items", label: "Items", icon: Package },
  { id: "monsters", label: "Monster", icon: Skull },
  { id: "pets", label: "Pets", icon: PawPrint },
  { id: "games", label: "Games", icon: Gamepad2 },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "audit", label: "Audit-Log", icon: ScrollText },
  { id: "tickets", label: "Tickets", icon: MessageCircle },
  { id: "moderators", label: "Moderatoren", icon: Shield },
  { id: "debug", label: "Debug Log", icon: Bug },
  { id: "backup", label: "Backup", icon: Database },
  { id: "security", label: "Sicherheit", icon: ShieldAlert },
  { id: "patchnotes", label: "Patch Notes", icon: FileText },
];

export function AdminShell({
  credits: initialCredits,
  streakDays,
  auditLog: initialAuditLog,
  caseTiers,
  profiles: initialProfiles,
  items: initialItems,
  streakConfig,
  shopSettings,
  todayShopListings,
  tomorrowShopListings,
  monsterTypes,
  petTypes,
  killStreakConfig,
  worldSessionConfig,
  characterConfig,
  worldSpawnConfig,
  siteConfig,
  modPermissions,
  patchNotes,
  donConfig,
  snakeConfig,
  mineConfig,
}: AdminShellProps) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const qTab = searchParams.get("tab");
    return (qTab && TABS.some((t) => t.id === qTab) ? qTab : "economy") as Tab;
  });
  const [openTicketId, setOpenTicketId] = useState<string | null>(() => searchParams.get("open"));
  const [items, setItems] = useState(initialItems);
  const [credits, setCredits] = useState(initialCredits);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [auditLog, setAuditLog] = useState(initialAuditLog);
  const [userSearch, setUserSearch] = useState("");
  const profilesRef = useRef(profiles);
  profilesRef.current = profiles;

  useRealtimeProfile((row) => {
    if (typeof row.credits === "number") setCredits(row.credits);
  });

  // Live-update user list: reflect credit/role/ban changes by any admin or
  // server action without requiring a page reload.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-profiles-live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles" },
        (payload) => {
          const row = payload.new as ProfileRow;
          setProfiles((prev) =>
            prev.map((p) => (p.id === row.id ? { ...p, ...row } : p))
          );
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "profiles" },
        (payload) => {
          const row = payload.new as ProfileRow;
          setProfiles((prev) => {
            if (prev.some((p) => p.id === row.id)) return prev;
            // Prepend new registrations — they have no cases opened yet so
            // they'd fall to the bottom of a credits sort anyway.
            return [row, ...prev];
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Live-update audit log: new entries appear instantly without page reload.
  // NOTE: audit_logs Realtime must be enabled in Supabase → Table Editor →
  // audit_logs → Realtime toggle (same way profiles table is enabled).
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("admin-audit-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_logs" },
        (payload) => {
          const row = payload.new as {
            id: string;
            user_id: string;
            action: string;
            payload: Record<string, unknown> | null;
            created_at: string;
          };
          // Resolve the actor username from the profiles list in memory — avoids
          // a separate fetch while still showing the correct name in most cases.
          const actorName = profilesRef.current.find((p) => p.id === row.user_id)?.username ?? null;
          const entry: AuditLogEntry = {
            id: row.id,
            action: row.action,
            payload: row.payload,
            created_at: row.created_at,
            profiles: actorName ? { username: actorName } : null,
          };
          setAuditLog((prev) => [entry, ...prev].slice(0, 100));
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const sound = useSoundManager();

  const filteredProfiles =
    userSearch.trim().length > 0
      ? profiles.filter(
          (p) =>
            p.username.toLowerCase().includes(userSearch.toLowerCase()) ||
            p.id.toLowerCase().startsWith(userSearch.toLowerCase())
        )
      : profiles;

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} isAdmin={true} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-4 flex items-center gap-4">
          <Link
            href="/"
            onMouseEnter={sound.hover}
            onClick={sound.click}
            className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Link>
          <Link
            href="/mod"
            onMouseEnter={sound.hover}
            onClick={sound.click}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-300 hover:bg-sky-500/20"
          >
            <Shield className="h-3.5 w-3.5" />
            Mod-Panel
          </Link>
        </div>
        <h1 className="glow-text mb-6 text-2xl font-extrabold text-zinc-50">Admin-Panel</h1>

        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onMouseEnter={sound.hover}
              onClick={() => {
                sound.click();
                setTab(t.id);
              }}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? "border-purple-400 bg-purple-500/15 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.45)]"
                  : "border-white/10 text-zinc-400 hover:border-white/30"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "economy" && (
          <div className="flex flex-col gap-4">
            {caseTiers.length === 0 ? (
              <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
                Keine Case-Tiers in der DB. Führe einmalig{" "}
                <code className="rounded bg-black/40 px-1.5 py-0.5">
                  node scripts/seed-case-tiers.mjs
                </code>{" "}
                aus.
              </p>
            ) : (
              caseTiers.map((tier) => <CaseTierEditor key={tier.id} tier={tier} items={items} />)
            )}
          </div>
        )}

        {tab === "streak" && <StreakConfigEditor config={streakConfig} />}

        {tab === "shop" && (
          <ShopTab
            settings={shopSettings}
            todayListings={todayShopListings}
            tomorrowListings={tomorrowShopListings}
            items={items}
          />
        )}

        {tab === "users" && (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                placeholder="Username oder ID suchen…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 py-2 pl-9 pr-4 text-sm text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-purple-400/60"
              />
            </div>
            {filteredProfiles.length === 0 && (
              <p className="text-sm text-zinc-500">Kein User gefunden.</p>
            )}
            {filteredProfiles.map((profile) => (
              <UserRowEditor key={profile.id} profile={profile} />
            ))}
          </div>
        )}

        {tab === "items" && <ItemsTab items={items} setItems={setItems} />}

        {tab === "monsters" && (
          <div className="flex flex-col gap-3">
            <KillStreakConfigEditor config={killStreakConfig} />
            <p className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3 text-xs text-zinc-400">
              Diese {monsterTypes.length} Monster-Varianten sind fest — hier lassen sich alle ihre Werte
              (Leben, Schaden, Tempo, Reichweiten, Belohnung, Spawn-Häufigkeit, Farbe) bearbeiten oder eine
              Variante komplett deaktivieren. Neue Varianten hinzufügen ist bewusst nicht Teil dieser Ansicht.
            </p>
            {monsterTypes.map((type) => (
              <MonsterTypeEditor key={type.id} type={type} />
            ))}
          </div>
        )}

        {tab === "pets" && (
          <div className="flex flex-col gap-3">
            <p className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3 text-xs text-zinc-400">
              Diese Pet-Spezies sind fest — jede equipte Pet-Item wird anhand ihres Namens einer
              dieser Spezies zugeordnet (Hund/Katze/Phönix/Drache/Geist, alles andere fällt unter
              „Sonstiges Haustier“). Pets greifen Monster in ihrem Aggro-Radius eigenständig an.
            </p>
            {petTypes.map((type) => (
              <PetConfigEditor key={type.id} type={type} />
            ))}
          </div>
        )}

        {tab === "games" && (
          <GamesTab
            worldSessionConfig={worldSessionConfig}
            killStreakConfig={killStreakConfig}
            characterConfig={characterConfig}
            worldSpawnConfig={worldSpawnConfig}
            topProfiles={profiles}
            donConfig={donConfig}
            snakeConfig={snakeConfig}
            mineConfig={mineConfig}
          />
        )}

        {tab === "branding" && <SiteConfigEditor config={siteConfig} />}

        {tab === "audit" && (
          <AuditTimeline
            entries={auditLog.map((entry) => ({
              ...entry,
              actor: entry.profiles?.username,
            }))}
          />
        )}


        {tab === "tickets" && (
          <TicketsTab
            openTicketId={openTicketId}
            onTicketOpened={() => setOpenTicketId(null)}
          />
        )}

        {tab === "moderators" && <ModConfigEditor permissions={modPermissions} />}

        {tab === "debug" && <DebugLogTab />}

        {tab === "backup" && <BackupTab />}

        {tab === "security" && <SecurityTab />}

        {tab === "patchnotes" && <PatchNotesEditor initialNotes={patchNotes} />}
      </main>
    </div>
  );
}
