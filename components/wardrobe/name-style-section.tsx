"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Sparkles, CheckCircle2, XCircle, Eye, RotateCcw, ChevronDown } from "lucide-react";
import { StyledUsername, RarityChip } from "@/components/ui/styled-username";
import {
  NAME_STYLES,
  STYLES_BY_RARITY,
  RARITY_COLORS,
  type NameStyleDef,
  type NameStyleRarity,
} from "@/lib/name-styles";
import { equipNameStyle, getMyNameStyles, type UserNameStyleRow } from "@/lib/actions/name-styles";
import { useLiveConfig } from "@/lib/use-live-config";

// ── Types ──────────────────────────────────────────────────────────────────────

interface NameStyleSectionProps {
  initialOwned: UserNameStyleRow[];
  initialActiveKey: string | null;
  username: string;
  credits: number;
  isAdmin?: boolean;
}

type TabKey = "owned" | "alle" | NameStyleRarity;

interface FlashMessage {
  ok: boolean;
  text: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: "owned",    label: "Meine"    },
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

const cardVariants = {
  hidden:  { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { type: "spring" as const, stiffness: 260, damping: 22 } },
  exit:    { opacity: 0, scale: 0.85, transition: { duration: 0.15 } },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

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
        {flash.ok ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
        <span className="flex-1">{flash.text}</span>
        <button onClick={onDismiss} className="ml-1 rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Schließen">
          ✕
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

function SourceChip({ source }: { source: UserNameStyleRow["source"] }) {
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-widest ${SOURCE_COLORS[source]}`}>
      {SOURCE_LABELS[source]}
    </span>
  );
}

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
        <span className="absolute right-1.5 top-1.5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white">
          Aktiv
        </span>
      )}
      <div className="flex h-8 items-center justify-center">
        <span className="text-sm font-bold text-zinc-300">{username}</span>
      </div>
      <span className="text-[9px] uppercase tracking-widest text-zinc-500 border border-zinc-700 rounded px-1.5 py-0.5">
        Normal
      </span>
      <span className="text-[10px] text-zinc-400">Standard</span>
    </motion.button>
  );
}

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
  const isSpecialLocked = style.is_special && !owned;

  return (
    <motion.button
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      onClick={owned || !isSpecialLocked ? onClick : undefined}
      disabled={!owned && style.is_special}
      className={`group relative flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-xl border p-3 text-left transition-all duration-200 ${
        active
          ? "border-purple-400 bg-purple-900/30 ring-1 ring-purple-500/40"
          : owned
          ? `${r.border} ${r.bg} hover:border-purple-400/60`
          : isSpecialLocked
          ? "border-zinc-800/40 bg-zinc-900/40 opacity-40 cursor-not-allowed"
          : "border-zinc-700/40 bg-zinc-900/50 opacity-60 cursor-not-allowed"
      }`}
    >
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
      {!owned && isSpecialLocked && (
        <span className="absolute right-1.5 top-1.5 rounded-full bg-zinc-700/80 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-zinc-400">
          Exklusiv
        </span>
      )}
      {!owned && !isSpecialLocked && (
        <span className="absolute right-1.5 top-1.5">
          <Lock className="h-3 w-3 text-zinc-500" />
        </span>
      )}

      {style.prefix_icon && (
        <span className="absolute left-1.5 top-1.5 text-[10px]">{style.prefix_icon}</span>
      )}

      <div className="flex h-8 items-center justify-center">
        <StyledUsername name="YourName" styleDef={style} size="md" />
      </div>

      <RarityChip rarity={style.rarity} />

      <span className="max-w-[90px] truncate text-center text-[10px] text-zinc-400 leading-tight">
        {style.label}
      </span>

      {owned && source && <SourceChip source={source} />}
    </motion.button>
  );
}

// ── Admin test-mode panel ──────────────────────────────────────────────────────

function AdminTestPanel({
  username,
  previewKey,
  onPreviewChange,
  onReset,
}: {
  username: string;
  previewKey: string | null;
  onPreviewChange: (key: string | null) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const allStyles = useMemo(() => Object.values(NAME_STYLES), []);

  const groupedByRarity: Record<NameStyleRarity, NameStyleDef[]> = useMemo(() => ({
    normal:   allStyles.filter(s => s.rarity === "normal"),
    selten:   allStyles.filter(s => s.rarity === "selten"),
    mythisch: allStyles.filter(s => s.rarity === "mythisch"),
    ultra:    allStyles.filter(s => s.rarity === "ultra"),
  }), [allStyles]);

  const rarityLabels: Record<NameStyleRarity, string> = {
    normal:   "Normal",
    selten:   "Selten",
    mythisch: "Mythisch",
    ultra:    "Ultra",
  };

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-amber-950/10 p-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Eye className="h-4 w-4 text-amber-400" />
        <span className="text-sm font-bold text-amber-300">Admin-Testmodus</span>
        <span className="ml-1 text-[10px] text-amber-600/70">— Vorschau ohne Vergabe</span>
        <ChevronDown className={`ml-auto h-4 w-4 text-amber-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-3">
              {/* Current preview */}
              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">Vorschau aktiv</span>
                  {previewKey
                    ? <StyledUsername name={username} styleKey={previewKey} size="lg" />
                    : <span className="text-sm font-bold text-zinc-400">Keine Vorschau</span>
                  }
                </div>
                {previewKey && (
                  <button
                    onClick={onReset}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Reset
                  </button>
                )}
              </div>

              {/* Style picker grouped by rarity */}
              {(["normal", "selten", "mythisch", "ultra"] as NameStyleRarity[]).map(rarity => (
                <div key={rarity}>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest" style={{ color: RARITY_COLORS[rarity].color }}>
                    {rarityLabels[rarity]}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {groupedByRarity[rarity].filter(s => !s.is_special).map(s => (
                      <button
                        key={s.key}
                        onClick={() => onPreviewChange(s.key === previewKey ? null : s.key)}
                        className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-all ${
                          s.key === previewKey
                            ? "border-amber-400/60 bg-amber-900/30 text-amber-200"
                            : "border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
                        }`}
                      >
                        <StyledUsername name={s.label} styleDef={s} size="xs" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function NameStyleSection({
  initialOwned,
  initialActiveKey,
  username,
  credits,
  isAdmin = false,
}: NameStyleSectionProps) {
  const [ownedRows, setOwnedRows]   = useState<UserNameStyleRow[]>(initialOwned);
  const [activeKey, setActiveKey]   = useState<string | null>(initialActiveKey);
  // Live: admin grants/revokes/force-equips a style → reflect without reload.
  useLiveConfig("name-styles-live", getMyNameStyles, (r) => { setOwnedRows(r.owned); setActiveKey(r.activeKey); });
  const [activeTab, setActiveTab]   = useState<TabKey>("owned");
  const [flash, setFlash]           = useState<FlashMessage | null>(null);
  const [loading, setLoading]       = useState(false);
  const [adminPreviewKey, setAdminPreviewKey] = useState<string | null>(null);

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

  const allDisplayStyles = useMemo(
    () => Object.values(NAME_STYLES).filter((s) => s.key !== "default"),
    [],
  );

  const stylesByTab = useMemo((): NameStyleDef[] => {
    if (activeTab === "owned")  return allDisplayStyles.filter(s => ownedKeySet.has(s.key));
    if (activeTab === "alle")   return allDisplayStyles;
    return STYLES_BY_RARITY[activeTab as NameStyleRarity] ?? [];
  }, [activeTab, allDisplayStyles, ownedKeySet]);

  const countOwned = useCallback(
    (rarity: NameStyleRarity) =>
      ownedRows.filter((r) => NAME_STYLES[r.styleKey]?.rarity === rarity).length,
    [ownedRows],
  );
  const totalInRarity = useCallback(
    (rarity: NameStyleRarity) => STYLES_BY_RARITY[rarity].filter(s => !s.is_special).length,
    [],
  );

  // Preview resolves to: admin preview if set, otherwise real active
  const previewStyleDef = useMemo(() => {
    const k = adminPreviewKey ?? activeKey ?? "default";
    return NAME_STYLES[k] ?? NAME_STYLES["default"];
  }, [adminPreviewKey, activeKey]);

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
      if (key !== "default" && !ownedKeySet.has(key)) {
        showFlash(false, "Du besitzt diesen Style nicht.");
        return;
      }
      const previousKey = activeKey;
      setActiveKey(key === "default" ? null : key);
      setAdminPreviewKey(null);
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

  // ── Card click: only equip owned ──────────────────────────────────────────

  const handleCardClick = useCallback(
    (style: NameStyleDef) => {
      if (loading) return;
      if (!ownedKeySet.has(style.key)) {
        showFlash(false, "Du besitzt diesen Style noch nicht.");
        return;
      }
      const isCurrentlyActive = activeKey === style.key;
      if (isCurrentlyActive) return;
      handleEquip(style.key);
    },
    [loading, ownedKeySet, activeKey, handleEquip, showFlash],
  );

  // ── Counts ─────────────────────────────────────────────────────────────────

  const totalOwned = ownedRows.length;
  const totalAll   = allDisplayStyles.filter(s => !s.is_special).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <section className="flex flex-col gap-5">
      {/* ── Big preview header ──────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6">
        {/* Background glow matching active style */}
        {previewStyleDef.glow_color && (
          <div
            className="pointer-events-none absolute inset-0 opacity-10"
            style={{
              background: `radial-gradient(ellipse at 50% 50%, ${previewStyleDef.glow_color} 0%, transparent 70%)`,
            }}
          />
        )}

        <div className="relative flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-2 text-zinc-500 text-xs uppercase tracking-widest font-medium">
            <Sparkles className="h-3.5 w-3.5" />
            {adminPreviewKey ? "Admin-Vorschau" : "Namensstil-Vorschau"}
          </div>

          {/* Big username preview */}
          <div className="flex min-h-[56px] items-center justify-center">
            <StyledUsername
              name={username}
              styleDef={previewStyleDef}
              size="2xl"
            />
          </div>

          {adminPreviewKey && (
            <p className="rounded-full border border-amber-700/40 bg-amber-950/30 px-3 py-0.5 text-[10px] text-amber-400">
              Nur Vorschau — nicht gespeichert
            </p>
          )}

          <p className="max-w-xs text-xs text-zinc-500 leading-relaxed">
            {adminPreviewKey
              ? previewStyleDef.description
              : "Klicke einen Style den du besitzt, um ihn auszurüsten"
            }
          </p>

          <div className="flex items-center gap-2">
            <RarityChip rarity={previewStyleDef.rarity} />
            <span className="text-xs text-zinc-400">{previewStyleDef.label}</span>
          </div>
        </div>
      </div>

      {/* ── Flash banner ─────────────────────────────────────────────────────── */}
      {flash && <FlashBanner flash={flash} onDismiss={() => setFlash(null)} />}

      {/* ── Rarity tabs ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Style-Filter">
        {TABS.map((tab) => {
          const isActiveTab = activeTab === tab.key;
          let countLabel = "";
          if (tab.key === "owned")   countLabel = `${totalOwned}`;
          else if (tab.key === "alle")    countLabel = `${totalOwned}/${totalAll}`;
          else {
            const rarity = tab.key as NameStyleRarity;
            countLabel = `${countOwned(rarity)}/${totalInRarity(rarity)}`;
          }

          const rarityColor = (tab.key !== "alle" && tab.key !== "owned")
            ? RARITY_COLORS[tab.key as NameStyleRarity].color
            : tab.key === "owned" ? "#c084fc" : "#a1a1aa";

          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActiveTab}
              onClick={() => setActiveTab(tab.key)}
              className={`relative min-h-[44px] rounded-xl border px-3 py-1.5 text-left transition-all duration-150 ${
                isActiveTab
                  ? "border-purple-500/50 bg-purple-900/30 text-purple-200"
                  : "border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/15 hover:text-zinc-200"
              }`}
            >
              <span className="block text-xs font-semibold leading-tight">{tab.label}</span>
              <span
                className="block text-[9px] font-bold leading-tight opacity-80"
                style={{ color: isActiveTab ? undefined : rarityColor }}
              >
                {countLabel}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Style grid ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {(activeTab === "owned" || activeTab === "alle" || activeTab === "normal") && (
          <DefaultStyleCard
            active={activeKey === null && !adminPreviewKey}
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
              active={!adminPreviewKey && activeKey === style.key}
              source={ownedByKey[style.key]?.source}
              onClick={() => handleCardClick(style)}
            />
          ))}
        </AnimatePresence>
      </div>

      {stylesByTab.length === 0 && (
        <p className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-8 text-center text-sm text-zinc-500">
          {activeTab === "owned"
            ? "Du besitzt noch keine Namensstile. Verdiene sie im Shop, in Cases oder im Battle Pass."
            : "Keine Styles in dieser Kategorie."}
        </p>
      )}

      {/* ── Admin test-mode ───────────────────────────────────────────────────── */}
      {isAdmin && (
        <AdminTestPanel
          username={username}
          previewKey={adminPreviewKey}
          onPreviewChange={setAdminPreviewKey}
          onReset={() => setAdminPreviewKey(null)}
        />
      )}
    </section>
  );
}
