"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ScrollText, Coins, Users, Package, Flame, Store, Skull, PawPrint } from "lucide-react";
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
import { useSoundManager } from "@/lib/sound-manager";
import type { Rarity } from "@/lib/cases";
import type { StreakConfig } from "@/lib/streak";
import type { ShopSettings } from "@/lib/shop";
import type { AdminShopListing } from "@/lib/actions/shop";
import type { MonsterTypeConfig } from "@/lib/monsters";
import type { PetTypeConfig } from "@/lib/pets";
import type { KillStreakConfig } from "@/lib/kill-streak";

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
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  username: string;
  credits: number;
  role: string;
  cases_opened: number;
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
}

type Tab = "economy" | "streak" | "shop" | "users" | "items" | "monsters" | "pets" | "audit";

const TABS: { id: Tab; label: string; icon: typeof Coins }[] = [
  { id: "economy", label: "Economy & Cases", icon: Coins },
  { id: "streak", label: "Daily-Streak", icon: Flame },
  { id: "shop", label: "Shop", icon: Store },
  { id: "users", label: "User-Management", icon: Users },
  { id: "items", label: "Items", icon: Package },
  { id: "monsters", label: "Monster", icon: Skull },
  { id: "pets", label: "Pets", icon: PawPrint },
  { id: "audit", label: "Audit-Log", icon: ScrollText },
];

export function AdminShell({
  credits,
  streakDays,
  auditLog,
  caseTiers,
  profiles,
  items: initialItems,
  streakConfig,
  shopSettings,
  todayShopListings,
  tomorrowShopListings,
  monsterTypes,
  petTypes,
  killStreakConfig,
}: AdminShellProps) {
  const [tab, setTab] = useState<Tab>("economy");
  const [items, setItems] = useState(initialItems);
  const sound = useSoundManager();

  return (
    <div className="flex flex-1 flex-col">
      <TopBar credits={credits} streakDays={streakDays} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Link
          href="/"
          onMouseEnter={sound.hover}
          onClick={sound.click}
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Link>
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
              caseTiers.map((tier) => <CaseTierEditor key={tier.id} tier={tier} />)
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
            {profiles.map((profile) => (
              <UserRowEditor key={profile.id} profile={profile} />
            ))}
          </div>
        )}

        {tab === "items" && <ItemsTab items={items} setItems={setItems} />}

        {tab === "monsters" && (
          <div className="flex flex-col gap-3">
            <KillStreakConfigEditor config={killStreakConfig} />
            <p className="rounded-xl border border-purple-500/20 bg-purple-500/[0.04] px-4 py-3 text-xs text-zinc-400">
              Diese 4 Monster-Varianten sind fest — hier lassen sich alle ihre Werte (Leben, Schaden,
              Tempo, Reichweiten, Belohnung, Spawn-Häufigkeit, Farbe) bearbeiten oder eine Variante
              komplett deaktivieren. Neue Varianten hinzufügen ist bewusst nicht Teil dieser Ansicht.
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

        {tab === "audit" && (
          <AuditTimeline
            entries={auditLog.map((entry) => ({
              ...entry,
              actor: entry.profiles?.username,
            }))}
          />
        )}
      </main>
    </div>
  );
}
