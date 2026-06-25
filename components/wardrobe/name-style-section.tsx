"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Sparkles, ShoppingCart, CheckCircle2, XCircle } from "lucide-react";
import { StyledUsername, RarityChip } from "@/components/ui/styled-username";
import {
  NAME_STYLES,
  STYLES_BY_RARITY,
  RARITY_COLORS,
  type NameStyleDef,
  type NameStyleRarity,
} from "@/lib/name-styles";
import {
  equipNameStyle,
  purchaseNameStyle,
  type UserNameStyleRow,
} from "@/lib/actions/name-styles";

// ── Types ──────────────────────────────────────────────────────────────────────

interface NameStyleSectionProps {
  initialOwned: UserNameStyleRow[];
  initialActiveKey: string | null;
  username: string;
  credits: number;
}

type TabKey = "alle" | NameStyleRarity;

interface FlashMessage {
  ok: boolean;
  text: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: "alle",     label: "Alle"     },
  { key: "normal",   label: "Normal"   },
  { key: "selten",   label: "Selten"   },
  { key: "mythisch", label: "Mythisch" },
  { key: "ultra",    label: "Ultra"    },
];

const SOURCE_LABELS: Record<UserNameStyleRow["source"], string> = {
  gifted:      "Geschenkt",
  won:         "Gewonnen",
  purchased:   "Gekauft",
  achievement: "Achievement",
};

const SOURCE_COLORS: Record<UserNameStyleRow["source"], string> = {
  gifted:      "text-violet-300 bg-violet-950/60 border-violet-700/40",
  won:         "text-amber-300  bg-amber-950/60  border-amber-700/40",
  purchased:   "text-blue-300   bg-blue-950/60   border-blue-700/40",
  achievement: "text-emerald-300 bg-emerald-950/60 border-emerald-700/40",
};

// Card animation variants
const cardVariants = {
  hidden:  { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 260, damping: 22 } },
  exit:    { opacity: 0, scale: 0.85, transition: { duration: 0.15 } },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

/** Inline flash banner at top of section */
function FlashBanner({ flash, onDismiss }: { flash: FlashMessage; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      <motion.div
        key="flash"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
          flash.ok
            ? "border-emerald-700/50 bg-emerald-950/60 text-emerald-300"
            : "border-red-700/50 bg-red-950/60 text-red-300"
        }`}
      >
        {flash.ok
          ? <CheckCircle2 className="h-4 w-4 shrink-0" />
          : <XCircle className="h-4 w-4 shrink-0" />
        }
        <span className="flex-1">{flash.text}</span>
        <button
          onClick={onDismiss}
          className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100"
          aria-label="Schließen"
        >
          ✕
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

/** Source chip for how a style was obtained */
function SourceChip({ source }: { source: UserNameStyleRow["source"] }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest ${SOURCE_COLORS[source]}`}>
      {SOURCE_LABELS[source]}
    </span>
  );
}

/** Purchase confirm dialog (inline modal) */
function PurchaseDialog({
  style,
  credits,
  onConfirm,
  onCancel,
  loading,
}: {
  style: NameStyleDef;
  credits: number;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const canAfford = credits >= style.unlock_price_cr;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-zinc-50">Style kaufen</h3>
            <p className="mt-0.5 text-xs text-zinc-400">Einmaliger Kauf mit Credits</p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-full border border-white/10 p-1.5 text-zinc-400 hover:text-zinc-200"
          >
            ✕
          </button>
        </div>

        {/* Preview */}
        <div className={`mb-4 flex flex-col items-center gap-2 rounded-xl border p-4 ${RARITY_COLORS[style.rarity].border} ${RARITY_COLORS[style.rarity].bg}`}>
          <StyledUsername name="YourName" styleDef={style} size="xl" />
          <RarityChip rarity={style.rarity} />
          <p className="text-center text-xs text-zinc-400">{style.description}</p>
        </div>

        {/* Price row */}
        <div className="mb-4 flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
          <span className="text-sm text-zinc-400">Preis</span>
          <span className={`text-sm font-bold ${canAfford ? "text-amber-400" : "text-red-400"}`}>
            {style.unlock_price_cr.toLocaleString("de-DE")} CR
          </span>
        </div>

        {!canAfford && (
          <p className="mb-3 text-center text-xs text-red-400">
            Nicht genug Credits. Du hast {credits.toLocaleString("de-DE")} CR.
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            disabled={!canAfford || loading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-500/90 px-4 py-2.5 text-sm font-bold text-black transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ShoppingCart className="h-4 w-4" />
            {loading ? "Kaufe..." : "Kaufen"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/** Standard ("default") card — always first, unequips active style */
function DefaultStyleCard({
  active,
  username,
  onClick,
}: {
  active: boolean;
  username: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClick}
      className={`group relative flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-xl border p-3 text-left transition-all duration-200 ${
        active
          ? "border-purple-400 bg-purple-900/30 ring-1 ring-purple-500/40"
          : "border-zinc-700/50 bg-zinc-900/60 hover:border-zinc-500"
      }`}
    >
      {active && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-purple-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">
          Aktiv
        </span>
      )}
      <div className="flex h-8 items-center justify-center">
        <span className="font-semibold text-sm text-zinc-300">{username}</span>
      </div>
      <span className="text-[9px] uppercase tracking-widest text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">
        Normal
      </span>
      <span className="text-[10px] text-zinc-400">Standard</span>
    </motion.button>
  );
}

/** A single name style card in the grid */
function StyleCard({
  style,
  owned,
  active,
  source,
  onClick,
}: {
  style: NameStyleDef;
  owned: boolean;
  active: boolean;
  source?: UserNameStyleRow["source"];
  onClick: () => void;
}) {
  const r = RARITY_COLORS[style.rarity];
  const canBuy = !style.is_special && style.unlock_price_cr > 0;
  const isFreeSpecial = style.is_special || (style.unlock_price_cr === 0 && style.key !== "default");

  return (
    <motion.button
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={onClick}
      className={`group relative flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-xl border p-3 text-left transition-all duration-200 ${
        active
          ? "border-purple-400 bg-purple-900/30 ring-1 ring-purple-500/40"
          : owned
          ? `${r.border} ${r.bg} hover:border-purple-400/60`
          : canBuy
          ? "border-zinc-700/40 bg-zinc-900/60 opacity-70 hover:border-amber-500/40 hover:opacity-90"
          : "border-zinc-800/40 bg-zinc-900/40 opacity-50 cursor-not-allowed"
      }`}
    >
      {/* Status chip */}
      {active && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">
          Aktiv
        </span>
      )}
      {!active && owned && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-blue-600/80 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">
          Besitzt
        </span>
      )}
      {!owned && isFreeSpecial && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-zinc-700/80 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-zinc-400">
          Exklusiv
        </span>
      )}

      {/* Prefix icon (top-left) */}
      {style.prefix_icon && (
        <span className="absolute left-1.5 top-1.5 text-[10px]">{style.prefix_icon}</span>
      )}

      {/* Name preview */}
      <div className="flex h-8 items-center justify-center">
        <StyledUsername name="YourName" styleDef={style} size="md" />
      </div>

      <RarityChip rarity={style.rarity} />

      <span className="max-w-[90px] truncate text-center text-[10px] text-zinc-400 leading-tight">
        {style.label}
      </span>

      {/* Lock + price for purchasable unowned */}
      {!owned && canBuy && (
        <div className="flex items-center gap-1">
          <Lock className="h-2.5 w-2.5 text-amber-500" />
          <span className="text-[9px] font-bold text-amber-400">
            {style.unlock_price_cr.toLocaleString("de-DE")} CR
          </span>
        </div>
      )}

      {/* Source chip for owned */}
      {owned && source && (
        <SourceChip source={source} />
      )}
    </motion.button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function NameStyleSection({
  initialOwned,
  initialActiveKey,
  username,
  credits,
}: NameStyleSectionProps) {
  const [ownedRows, setOwnedRows]   = useState<UserNameStyleRow[]>(initialOwned);
  const [activeKey, setActiveKey]   = useState<string | null>(initialActiveKey);
  const [activeTab, setActiveTab]   = useState<TabKey>("alle");
  const [flash, setFlash]           = useState<FlashMessage | null>(null);
  const [loading, setLoading]       = useState(false);
  const [purchaseTarget, setPurchaseTarget] = useState<NameStyleDef | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const ownedKeySet = useMemo(
    () => new Set(ownedRows.map((r) => r.styleKey)),
    [ownedRows],
  );

  const ownedByKey = useMemo(() => {
    const map: Record<string, UserNameStyleRow> = {};
    for (const r of ownedRows) map[r.styleKey] = r;
    return map;
  }, [ownedRows]);

  /** All purchasable styles (non-default, non-special, or already owned) */
  const allDisplayStyles = useMemo(() => Object.values(NAME_STYLES).filter((s) => s.key !== "default"), []);

  const stylesByTab = useMemo((): NameStyleDef[] => {
    if (activeTab === "alle") return allDisplayStyles;
    return STYLES_BY_RARITY[activeTab as NameStyleRarity] ?? [];
  }, [activeTab, allDisplayStyles]);

  /** Count owned in a given rarity */
  const countOwned = useCallback(
    (rarity: NameStyleRarity): number =>
      ownedRows.filter((r) => NAME_STYLES[r.styleKey]?.rarity === rarity).length,
    [ownedRows],
  );

  const totalInRarity = useCallback(
    (rarity: NameStyleRarity): number => STYLES_BY_RARITY[rarity].length,
    [],
  );

  // ── Flash helper ───────────────────────────────────────────────────────────

  const showFlash = useCallback((ok: boolean, text: string) => {
    setFlash({ ok, text });
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, []);

  // ── Equip ─────────────────────────────────────────────────────────────────

  const handleEquip = useCallback(
    async (key: string) => {
      if (loading) return;
      // "default" always available; others must be owned
      if (key !== "default" && !ownedKeySet.has(key)) return;

      const previousKey = activeKey;
      // Optimistic update
      setActiveKey(key === "default" ? null : key);

      setLoading(true);
      try {
        const res = await equipNameStyle(key);
        if (!res.ok) {
          setActiveKey(previousKey);
          showFlash(false, res.error ?? "Fehler beim Ausrüsten.");
        } else {
          showFlash(true, key === "default" ? "Standard-Style aktiviert." : `„${NAME_STYLES[key]?.label}" ausgerüstet.`);
        }
      } finally {
        setLoading(false);
      }
    },
    [loading, ownedKeySet, activeKey, showFlash],
  );

  // ── Purchase ──────────────────────────────────────────────────────────────

  const handlePurchaseConfirm = useCallback(async () => {
    if (!purchaseTarget || loading) return;
    const style = purchaseTarget;

    setLoading(true);
    try {
      const res = await purchaseNameStyle(style.key);
      if (!res.ok) {
        showFlash(false, res.error ?? "Kauf fehlgeschlagen.");
      } else {
        // Add to owned rows optimistically
        const newRow: UserNameStyleRow = {
          id:         `optimistic-${style.key}`,
          styleKey:   style.key,
          source:     "purchased",
          unlockedAt: new Date().toISOString(),
          style,
        };
        setOwnedRows((prev) => [...prev, newRow]);
        showFlash(true, `„${style.label}" erfolgreich gekauft!`);
        setPurchaseTarget(null);
        // Auto-equip after purchase
        await handleEquip(style.key);
      }
    } finally {
      setLoading(false);
    }
  }, [purchaseTarget, loading, showFlash, handleEquip]);

  // ── Card click handler ────────────────────────────────────────────────────

  const handleCardClick = useCallback(
    (style: NameStyleDef) => {
      if (loading) return;
      const owned = ownedKeySet.has(style.key);
      const isCurrentlyActive = (style.key === "default" && activeKey === null) || activeKey === style.key;

      if (owned || style.key === "default") {
        if (isCurrentlyActive) return; // already active — nothing to do
        handleEquip(style.key);
        return;
      }

      // Not owned
      if (style.is_special || style.unlock_price_cr === 0) return; // can't buy
      setPurchaseTarget(style);
    },
    [loading, ownedKeySet, activeKey, handleEquip],
  );

  // ── Current active style def ──────────────────────────────────────────────

  const activeStyleDef = useMemo(
    () => (activeKey ? (NAME_STYLES[activeKey] ?? NAME_STYLES["default"]) : NAME_STYLES["default"]),
    [activeKey],
  );

  // ── Tab counts ─────────────────────────────────────────────────────────────

  const totalOwned = ownedRows.length;
  const totalAll   = allDisplayStyles.length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="flex flex-col gap-5">
      {/* ── Preview header card ─────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase tracking-widest font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            Namensstil-Vorschau
          </div>

          {/* Big username preview */}
          <div className="flex min-h-[48px] items-center justify-center">
            <StyledUsername
              name={username}
              styleKey={activeKey}
              styleDef={activeStyleDef}
              size="2xl"
            />
          </div>

          <p className="max-w-xs text-xs text-zinc-500 leading-relaxed">
            Wähle ein Design für deinen Namen überall auf der Site
          </p>

          {/* Active style label + rarity */}
          <div className="flex items-center gap-2">
            <RarityChip rarity={activeStyleDef.rarity} />
            <span className="text-xs text-zinc-400">{activeStyleDef.label}</span>
          </div>
        </div>
      </div>

      {/* ── Flash banner ─────────────────────────────────────────────────────── */}
      {flash && (
        <FlashBanner flash={flash} onDismiss={() => setFlash(null)} />
      )}

      {/* ── Rarity tabs ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Rarity-Filter">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          let countLabel = "";
          if (tab.key === "alle") {
            countLabel = `${totalOwned}/${totalAll}`;
          } else {
            const rarity = tab.key as NameStyleRarity;
            countLabel = `${countOwned(rarity)}/${totalInRarity(rarity)}`;
          }

          const rarityColor = tab.key !== "alle"
            ? RARITY_COLORS[tab.key as NameStyleRarity].color
            : "#a1a1aa";

          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              className={`relative min-h-[44px] rounded-xl border px-3 py-1.5 text-left transition-all duration-150 ${
                isActive
                  ? "border-purple-500/50 bg-purple-900/30 text-purple-200"
                  : "border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-zinc-200"
              }`}
            >
              <span className="block text-xs font-semibold leading-tight">{tab.label}</span>
              <span
                className="block text-[9px] font-bold leading-tight opacity-80"
                style={{ color: isActive ? undefined : rarityColor }}
              >
                {countLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Style grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {/* Standard card — always first when on "Alle" tab or "Normal" tab */}
        {(activeTab === "alle" || activeTab === "normal") && (
          <DefaultStyleCard
            active={activeKey === null}
            username={username}
            onClick={() => handleEquip("default")}
          />
        )}

        <AnimatePresence mode="popLayout">
          {stylesByTab.map((style) => (
            <StyleCard
              key={style.key}
              style={style}
              owned={ownedKeySet.has(style.key)}
              active={activeKey === style.key}
              source={ownedByKey[style.key]?.source}
              onClick={() => handleCardClick(style)}
            />
          ))}
        </AnimatePresence>
      </div>

      {stylesByTab.length === 0 && activeTab !== "alle" && (
        <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">
          Keine Styles in dieser Kategorie.
        </p>
      )}

      {/* ── Purchase dialog ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {purchaseTarget && (
          <PurchaseDialog
            style={purchaseTarget}
            credits={credits}
            onConfirm={handlePurchaseConfirm}
            onCancel={() => setPurchaseTarget(null)}
            loading={loading}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
