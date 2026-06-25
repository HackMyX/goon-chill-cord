"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search,
  Plus,
  Trash2,
  Gift,
  X,
  ChevronDown,
  Loader2,
  AlertTriangle,
  Shield,
  Palette,
  User,
  RefreshCw,
  Eye,
  Save,
  ShoppingBag,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  adminGrantNameStyle,
  adminRevokeNameStyle,
  adminGetAllUserStyles,
  adminForceEquipStyle,
  adminWarnUser,
  adminClearWarnings,
  adminUpsertNameStyle,
  adminDeleteNameStyle,
  getNameStyleCatalog,
  adminGetNameStylesWithShopStatus,
  adminSetNameStyleShopAvailability,
  getNameStyleRarityConfigs,
  adminUpdateNameStyleRarityConfig,
  adminBulkUpdateStylePricesByRarity,
  type NameStyleShopRow,
} from "@/lib/actions/name-styles";
import {
  StyledUsername,
  RarityChip,
  NameStyleCard,
} from "@/components/ui/styled-username";
import {
  NAME_STYLES,
  STYLES_BY_RARITY,
  RARITY_COLORS,
  NAME_STYLE_RARITY_PRICES,
  type NameStyleDef,
  type NameStyleRarity,
  type NameStyleRarityConfig,
  type AnimationType,
} from "@/lib/name-styles";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ProfileRow {
  id: string;
  username: string;
  credits: number;
  role: string;
  cases_opened: number;
  support_banned?: boolean;
  verified?: boolean;
  warning_strikes?: number;
  warning_note?: string;
}

interface NameStylesTabProps {
  profiles: ProfileRow[];
}

type SectionTab = "katalog" | "vergeben" | "erstellen" | "shop" | "seltenheiten";

interface FlashMsg {
  type: "ok" | "err";
  text: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Flash helper hook
// ─────────────────────────────────────────────────────────────────────────────

function useFlash() {
  const [flash, setFlash] = useState<FlashMsg | null>(null);

  const show = useCallback((type: FlashMsg["type"], text: string) => {
    setFlash({ type, text });
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, []);

  return { flash, show };
}

// ─────────────────────────────────────────────────────────────────────────────
// Flash banner
// ─────────────────────────────────────────────────────────────────────────────

function FlashBanner({ flash }: { flash: FlashMsg | null }) {
  if (!flash) return null;
  return (
    <div
      className={`fixed top-4 right-4 z-[999] flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium shadow-xl transition-all
        ${flash.type === "ok"
          ? "border-green-500/50 bg-green-950/90 text-green-300"
          : "border-red-500/50 bg-red-950/90 text-red-300"
        }`}
    >
      {flash.type === "ok" ? (
        <Shield className="h-4 w-4 shrink-0" />
      ) : (
        <AlertTriangle className="h-4 w-4 shrink-0" />
      )}
      {flash.text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-6 flex items-start gap-3">
      <div className="mt-0.5 rounded-lg bg-zinc-800 p-2">
        <Icon className="h-5 w-5 text-purple-400" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
        <p className="text-xs text-zinc-500 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rarity section divider
// ─────────────────────────────────────────────────────────────────────────────

function RaritySection({
  rarity,
  styles,
  onSelectStyle,
}: {
  rarity: NameStyleRarity;
  styles: NameStyleDef[];
  onSelectStyle: (style: NameStyleDef) => void;
}) {
  const rc = RARITY_COLORS[rarity];
  if (!styles.length) return null;
  return (
    <div className="mb-6">
      <div
        className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest"
        style={{ color: rc.color }}
      >
        <div className="h-px flex-1" style={{ background: rc.color + "44" }} />
        <span>{rc.label}</span>
        <div className="h-px flex-1" style={{ background: rc.color + "44" }} />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {styles.map((s) => (
          <NameStyleCard
            key={s.key}
            style={s}
            owned
            active={false}
            onClick={() => onSelectStyle(s)}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Style detail modal
// ─────────────────────────────────────────────────────────────────────────────

function StyleDetailModal({
  style,
  profiles,
  userStyles,
  onClose,
  onGrant,
  onRevoke,
  onForceEquip,
  loadingKey,
}: {
  style: NameStyleDef;
  profiles: ProfileRow[];
  userStyles: Record<string, string[]>;
  onClose: () => void;
  onGrant: (userId: string, styleKey: string) => Promise<void>;
  onRevoke: (userId: string, styleKey: string) => Promise<void>;
  onForceEquip: (userId: string, styleKey: string | null) => Promise<void>;
  loadingKey: string | null;
}) {
  const [search, setSearch] = useState("");
  const [grantUserId, setGrantUserId] = useState("");

  const filtered = profiles.filter((p) =>
    p.username.toLowerCase().includes(search.toLowerCase())
  );

  const ownersIds = Object.entries(userStyles)
    .filter(([, keys]) => keys.includes(style.key))
    .map(([uid]) => uid);
  const owners = profiles.filter((p) => ownersIds.includes(p.id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800">
            <StyledUsername name="Aa" styleDef={style} size="lg" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-100">{style.label}</span>
              <RarityChip rarity={style.rarity} />
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">{style.description}</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 text-xs text-zinc-400">
          <div>Preis: <span className="text-amber-400 font-bold">{style.unlock_price_cr.toLocaleString("de-DE")} CR</span></div>
          <div>Animation: <span className="text-zinc-300">{style.animation_type}</span></div>
          <div>Aus Case: <span className={style.can_win_from_case ? "text-green-400" : "text-zinc-600"}>{style.can_win_from_case ? "Ja" : "Nein"}</span></div>
          <div>Speziell: <span className={style.is_special ? "text-purple-400" : "text-zinc-600"}>{style.is_special ? "Ja" : "Nein"}</span></div>
        </div>

        {/* Quick grant */}
        <div className="mb-4 rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
          <p className="mb-2 text-xs font-medium text-zinc-400">Style vergeben an:</p>
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
              value={grantUserId}
              onChange={(e) => setGrantUserId(e.target.value)}
            >
              <option value="">-- User auswählen --</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.username}
                </option>
              ))}
            </select>
            <button
              disabled={!grantUserId || loadingKey === `grant-${grantUserId}-${style.key}`}
              onClick={() => grantUserId && onGrant(grantUserId, style.key)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-700 px-3 py-2 text-xs font-medium text-white hover:bg-purple-600 disabled:opacity-50"
            >
              {loadingKey === `grant-${grantUserId}-${style.key}` ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Gift className="h-3 w-3" />
              )}
              Vergeben
            </button>
          </div>
        </div>

        {/* Owners */}
        {owners.length > 0 && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
            <p className="mb-2 text-xs font-medium text-zinc-400">
              Besitzer ({owners.length}):
            </p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {owners.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg bg-zinc-900 px-3 py-1.5"
                >
                  <span className="text-xs text-zinc-300">{p.username}</span>
                  <button
                    disabled={loadingKey === `revoke-${p.id}-${style.key}`}
                    onClick={() => onRevoke(p.id, style.key)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-950/50 disabled:opacity-40"
                  >
                    {loadingKey === `revoke-${p.id}-${style.key}` ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Trash2 className="h-3 w-3" />
                    )}
                    Entziehen
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Warn modal
// ─────────────────────────────────────────────────────────────────────────────

function WarnModal({
  user,
  onClose,
  onWarn,
  loading,
}: {
  user: ProfileRow;
  onClose: () => void;
  onWarn: (userId: string, note: string) => Promise<void>;
  loading: boolean;
}) {
  const [note, setNote] = useState(user.warning_note ?? "");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-lg bg-amber-950/50 p-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-100">Benutzer verwarnen</h3>
            <p className="text-xs text-zinc-500">
              {user.username} — {user.warning_strikes ?? 0} Strike(s) aktiv
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-zinc-400">
            Verwarungsgrund (sichtbar für Mods)
          </label>
          <textarea
            className="w-full rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-amber-500 resize-none"
            rows={3}
            placeholder="Grund für die Verwarnung..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
          >
            Abbrechen
          </button>
          <button
            disabled={!note.trim() || loading}
            onClick={() => onWarn(user.id, note.trim())}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            Verwarnen
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1: Katalog
// ─────────────────────────────────────────────────────────────────────────────

function KatalogSection({
  profiles,
  userStyles,
  onGrant,
  onRevoke,
  onForceEquip,
  loadingKey,
  onCreateNew,
}: {
  profiles: ProfileRow[];
  userStyles: Record<string, string[]>;
  onGrant: (userId: string, styleKey: string) => Promise<void>;
  onRevoke: (userId: string, styleKey: string) => Promise<void>;
  onForceEquip: (userId: string, styleKey: string | null) => Promise<void>;
  loadingKey: string | null;
  onCreateNew: () => void;
}) {
  const [selectedStyle, setSelectedStyle] = useState<NameStyleDef | null>(null);
  const rarities: NameStyleRarity[] = ["ultra", "mythisch", "selten", "normal"];

  return (
    <div>
      <SectionHeader
        title="Style-Katalog"
        description="Alle verfügbaren Name Styles nach Seltenheit. Klicke einen Style um Details zu sehen oder ihn zu vergeben."
        icon={Palette}
      />

      <div className="mb-4 flex justify-end">
        <button
          onClick={onCreateNew}
          className="flex items-center gap-2 rounded-lg bg-purple-700 px-4 py-2 text-sm font-medium text-white hover:bg-purple-600"
        >
          <Plus className="h-4 w-4" />
          Custom Style erstellen
        </button>
      </div>

      {rarities.map((rarity) => (
        <RaritySection
          key={rarity}
          rarity={rarity}
          styles={STYLES_BY_RARITY[rarity]}
          onSelectStyle={setSelectedStyle}
        />
      ))}

      {selectedStyle && (
        <StyleDetailModal
          style={selectedStyle}
          profiles={profiles}
          userStyles={userStyles}
          onClose={() => setSelectedStyle(null)}
          onGrant={onGrant}
          onRevoke={onRevoke}
          onForceEquip={onForceEquip}
          loadingKey={loadingKey}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2: Style vergeben / entziehen
// ─────────────────────────────────────────────────────────────────────────────

function UserStyleRow({
  profile,
  ownedKeys,
  onGrant,
  onRevoke,
  onForceEquip,
  onWarn,
  onClearWarnings,
  loadingKey,
}: {
  profile: ProfileRow;
  ownedKeys: string[];
  onGrant: (userId: string, styleKey: string) => Promise<void>;
  onRevoke: (userId: string, styleKey: string) => Promise<void>;
  onForceEquip: (userId: string, styleKey: string | null) => Promise<void>;
  onWarn: (user: ProfileRow) => void;
  onClearWarnings: (userId: string) => Promise<void>;
  loadingKey: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [grantKey, setGrantKey] = useState("");
  const [equipKey, setEquipKey] = useState<string>("default");
  const strikes = profile.warning_strikes ?? 0;
  const hasWarning = strikes > 0;

  const allStyleKeys = Object.keys(NAME_STYLES);

  return (
    <div
      className={`rounded-xl border transition-colors ${
        hasWarning
          ? "border-red-500/40 bg-red-950/10"
          : "border-zinc-700/60 bg-zinc-800/40"
      }`}
    >
      {/* Header row */}
      <button
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-700 text-xs font-bold text-zinc-300">
            {profile.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-zinc-200 text-sm">{profile.username}</span>
              {hasWarning && (
                <span className="flex items-center gap-1 rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-bold text-orange-400 border border-orange-500/30">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {strikes} Strike{strikes !== 1 ? "s" : ""}
                </span>
              )}
              <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-400">
                {profile.role}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              {ownedKeys.length} Style{ownedKeys.length !== 1 ? "s" : ""} besessen
            </p>
          </div>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-zinc-700/60 px-4 pb-4 pt-3 space-y-4">
          {/* Warning note */}
          {hasWarning && profile.warning_note && (
            <div className="rounded-lg border border-orange-500/30 bg-orange-950/20 px-3 py-2 text-xs text-orange-300">
              <span className="font-bold">Verwarungsnotiz:</span> {profile.warning_note}
            </div>
          )}

          {/* Owned styles */}
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-500">Besessene Styles:</p>
            {ownedKeys.length === 0 ? (
              <p className="text-xs text-zinc-600 italic">Keine Styles besessen.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {ownedKeys.map((key) => {
                  const def = NAME_STYLES[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-1.5 rounded-full border border-zinc-600/60 bg-zinc-900 px-3 py-1"
                    >
                      {def ? (
                        <StyledUsername name={def.label} styleDef={def} size="sm" />
                      ) : (
                        <span className="text-xs text-zinc-400">{key}</span>
                      )}
                      <button
                        disabled={loadingKey === `revoke-${profile.id}-${key}`}
                        onClick={() => onRevoke(profile.id, key)}
                        className="ml-0.5 rounded-full p-0.5 text-zinc-600 hover:text-red-400 disabled:opacity-40"
                        title="Entziehen"
                      >
                        {loadingKey === `revoke-${profile.id}-${key}` ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <X className="h-2.5 w-2.5" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Grant style */}
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-500">Style vergeben:</p>
            <div className="flex gap-2">
              <select
                className="flex-1 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={grantKey}
                onChange={(e) => setGrantKey(e.target.value)}
              >
                <option value="">-- Style auswählen --</option>
                {allStyleKeys.map((k) => (
                  <option key={k} value={k}>
                    {NAME_STYLES[k]?.label ?? k} ({k})
                  </option>
                ))}
              </select>
              <button
                disabled={!grantKey || loadingKey === `grant-${profile.id}-${grantKey}`}
                onClick={() => grantKey && onGrant(profile.id, grantKey)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-purple-700 px-3 py-2 text-xs font-medium text-white hover:bg-purple-600 disabled:opacity-50"
              >
                {loadingKey === `grant-${profile.id}-${grantKey}` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Gift className="h-3 w-3" />
                )}
                Vergeben
              </button>
            </div>
          </div>

          {/* Force equip */}
          <div>
            <p className="mb-2 text-xs font-medium text-zinc-500">Style erzwingen:</p>
            <div className="flex gap-2">
              <select
                className="flex-1 rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={equipKey}
                onChange={(e) => setEquipKey(e.target.value)}
              >
                <option value="default">Standard (kein Style)</option>
                {ownedKeys.map((k) => (
                  <option key={k} value={k}>
                    {NAME_STYLES[k]?.label ?? k} ({k})
                  </option>
                ))}
              </select>
              <button
                disabled={loadingKey === `equip-${profile.id}`}
                onClick={() => onForceEquip(profile.id, equipKey === "default" ? null : equipKey)}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-700 px-3 py-2 text-xs font-medium text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {loadingKey === `equip-${profile.id}` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                Ausrüsten
              </button>
            </div>
          </div>

          {/* Warning actions */}
          <div className="flex flex-wrap gap-2 border-t border-zinc-700/60 pt-3">
            <button
              onClick={() => onWarn(profile)}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/30 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-950/60"
            >
              <AlertTriangle className="h-3 w-3" />
              Verwarnen
            </button>
            {hasWarning && (
              <button
                disabled={loadingKey === `clearwarn-${profile.id}`}
                onClick={() => onClearWarnings(profile.id)}
                className="flex items-center gap-1.5 rounded-lg border border-green-500/40 bg-green-950/30 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-950/60 disabled:opacity-50"
              >
                {loadingKey === `clearwarn-${profile.id}` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Verwarnungen löschen
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function VergebenSection({
  profiles,
  userStyles,
  onGrant,
  onRevoke,
  onForceEquip,
  onWarn,
  onClearWarnings,
  loadingKey,
}: {
  profiles: ProfileRow[];
  userStyles: Record<string, string[]>;
  onGrant: (userId: string, styleKey: string) => Promise<void>;
  onRevoke: (userId: string, styleKey: string) => Promise<void>;
  onForceEquip: (userId: string, styleKey: string | null) => Promise<void>;
  onWarn: (user: ProfileRow) => void;
  onClearWarnings: (userId: string) => Promise<void>;
  loadingKey: string | null;
}) {
  const [search, setSearch] = useState("");

  const filtered = profiles.filter((p) =>
    p.username.toLowerCase().includes(search.toLowerCase())
  );

  // Sort: users with warnings first
  const sorted = [...filtered].sort((a, b) => {
    const aStrikes = a.warning_strikes ?? 0;
    const bStrikes = b.warning_strikes ?? 0;
    return bStrikes - aStrikes;
  });

  return (
    <div>
      <SectionHeader
        title="Style vergeben / entziehen"
        description="Styles an Benutzer vergeben, entziehen oder erzwingen. Verwarnungen verwalten."
        icon={User}
      />

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Benutzer suchen..."
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-9 pr-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        {sorted.length === 0 ? (
          <p className="text-center text-sm text-zinc-600 py-8">Keine Benutzer gefunden.</p>
        ) : (
          sorted.map((p) => (
            <UserStyleRow
              key={p.id}
              profile={p}
              ownedKeys={userStyles[p.id] ?? []}
              onGrant={onGrant}
              onRevoke={onRevoke}
              onForceEquip={onForceEquip}
              onWarn={onWarn}
              onClearWarnings={onClearWarnings}
              loadingKey={loadingKey}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3: Custom Style erstellen
// ─────────────────────────────────────────────────────────────────────────────

const ANIMATION_TYPES: AnimationType[] = [
  "none", "shimmer", "pulse", "wave", "rainbow", "prismatic",
  "flicker", "glitch", "matrix", "hologram", "obfuscated", "rgb_wave",
  "aurora", "fire", "electric", "cyber", "neon_glow", "blood_moon",
  "venom", "starfield", "divine", "chaos",
];

const ANIMATION_LABELS: Record<AnimationType, string> = {
  none:       "Keine",
  shimmer:    "Schimmer",
  pulse:      "Puls",
  wave:       "Welle",
  rainbow:    "Regenbogen",
  prismatic:  "Prismatisch",
  flicker:    "Flackern",
  glitch:     "Glitch",
  matrix:     "Matrix",
  hologram:   "Hologramm",
  obfuscated: "Obfuscated",
  rgb_wave:   "RGB Welle",
  aurora:     "Nordlicht",
  fire:       "Feuer",
  electric:   "Elektrisch",
  cyber:      "Cyberpunk",
  neon_glow:  "Neon Glow",
  blood_moon: "Blutmond",
  venom:      "Venom",
  starfield:  "Sternfeld",
  divine:     "Göttlich",
  chaos:      "Chaos",
};

const RARITY_OPTIONS: NameStyleRarity[] = ["normal", "selten", "mythisch", "ultra"];

interface StyleFormData {
  key: string;
  label: string;
  description: string;
  rarity: NameStyleRarity;
  color1: string;
  color2: string;
  color3: string;
  animation_type: AnimationType;
  animation_speed: number;
  glow_color: string;
  glow_radius: number;
  prefix_icon: string;
  suffix_icon: string;
  unlock_price_cr: number;
  can_win_from_case: boolean;
  is_special: boolean;
}

const DEFAULT_FORM: StyleFormData = {
  key: "",
  label: "",
  description: "",
  rarity: "normal",
  color1: "#a855f7",
  color2: "",
  color3: "",
  animation_type: "none",
  animation_speed: 1,
  glow_color: "",
  glow_radius: 0,
  prefix_icon: "",
  suffix_icon: "",
  unlock_price_cr: 0,
  can_win_from_case: false,
  is_special: false,
};

function ColorField({
  label,
  value,
  onChange,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  optional?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-zinc-400">
        {label} {optional && <span className="text-zinc-600">(optional)</span>}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-9 shrink-0 cursor-pointer rounded-lg border border-zinc-600 bg-zinc-800 p-1"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={optional ? "#000000 oder leer" : "#000000"}
          className="flex-1 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 font-mono text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
        />
        {optional && value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="rounded p-1.5 text-zinc-600 hover:text-zinc-400"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function ErstellenSection({
  onSave,
  loadingKey,
  initialData,
}: {
  onSave: (data: Partial<NameStyleDef> & { key: string }) => Promise<void>;
  loadingKey: string | null;
  initialData?: Partial<StyleFormData>;
}) {
  const [form, setForm] = useState<StyleFormData>({ ...DEFAULT_FORM, ...initialData });

  const update = <K extends keyof StyleFormData>(key: K, value: StyleFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const previewDef: NameStyleDef = {
    key: form.key || "preview",
    label: form.label || "Vorschau",
    description: form.description,
    rarity: form.rarity,
    category: "solid",
    color1: form.color1 || "#a855f7",
    color2: form.color2 || undefined,
    color3: form.color3 || undefined,
    animation_type: form.animation_type,
    animation_speed: form.animation_speed,
    glow_color: form.glow_color || undefined,
    glow_radius: form.glow_radius,
    prefix_icon: form.prefix_icon || undefined,
    suffix_icon: form.suffix_icon || undefined,
    unlock_price_cr: form.unlock_price_cr,
    can_win_from_case: form.can_win_from_case,
    is_special: form.is_special,
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      key: form.key,
      label: form.label,
      description: form.description,
      rarity: form.rarity,
      color1: form.color1,
      color2: form.color2 || undefined,
      color3: form.color3 || undefined,
      animation_type: form.animation_type,
      animation_speed: form.animation_speed,
      glow_color: form.glow_color || undefined,
      glow_radius: form.glow_radius,
      prefix_icon: form.prefix_icon || undefined,
      suffix_icon: form.suffix_icon || undefined,
      unlock_price_cr: form.unlock_price_cr,
      can_win_from_case: form.can_win_from_case,
      is_special: form.is_special,
    });
  };

  const isSaving = loadingKey === "upsert";

  return (
    <div>
      <SectionHeader
        title="Custom Style erstellen"
        description="Eigenen Name Style anlegen oder bestehenden (nicht-System) Style aktualisieren."
        icon={Plus}
      />

      {/* Live preview */}
      <div className="mb-6 rounded-xl border border-zinc-700/60 bg-zinc-800/40 p-5">
        <p className="mb-3 text-xs font-medium text-zinc-500">Live-Vorschau:</p>
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center justify-center h-14">
            <StyledUsername
              name={form.label || "Benutzername"}
              styleDef={previewDef}
              size="xl"
            />
          </div>
          <RarityChip rarity={form.rarity} />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Identity */}
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-800/20 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Identität</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Key <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="my_custom_style"
                pattern="[a-z0-9_]+"
                title="Nur Kleinbuchstaben, Ziffern und Unterstriche"
                className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={form.key}
                onChange={(e) => update("key", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Anzeigename <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Mein Style"
                className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={form.label}
                onChange={(e) => update("label", e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Beschreibung</label>
              <input
                type="text"
                placeholder="Kurze Beschreibung..."
                className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Seltenheit</label>
              <select
                className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={form.rarity}
                onChange={(e) => update("rarity", e.target.value as NameStyleRarity)}
              >
                {RARITY_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {RARITY_COLORS[r].label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Colors */}
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-800/20 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Farben</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <ColorField
              label="Farbe 1"
              value={form.color1}
              onChange={(v) => update("color1", v)}
            />
            <ColorField
              label="Farbe 2"
              value={form.color2}
              onChange={(v) => update("color2", v)}
              optional
            />
            <ColorField
              label="Farbe 3"
              value={form.color3}
              onChange={(v) => update("color3", v)}
              optional
            />
          </div>
        </div>

        {/* Animation */}
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-800/20 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Animation</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Animationstyp</label>
              <select
                className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={form.animation_type}
                onChange={(e) => update("animation_type", e.target.value as AnimationType)}
              >
                {ANIMATION_TYPES.map((a) => (
                  <option key={a} value={a}>
                    {ANIMATION_LABELS[a]} ({a})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Animationsgeschwindigkeit ({form.animation_speed.toFixed(1)}x)
              </label>
              <input
                type="range"
                min={0.1}
                max={3}
                step={0.1}
                className="w-full accent-purple-500"
                value={form.animation_speed}
                onChange={(e) => update("animation_speed", parseFloat(e.target.value))}
              />
              <div className="flex justify-between text-[10px] text-zinc-600 mt-0.5">
                <span>Langsam (0.1)</span>
                <span>Schnell (3.0)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Glow */}
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-800/20 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Leuchteffekt</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ColorField
              label="Glühfarbe"
              value={form.glow_color}
              onChange={(v) => update("glow_color", v)}
              optional
            />
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">
                Glühradius ({form.glow_radius}px)
              </label>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                className="w-full accent-purple-500"
                value={form.glow_radius}
                onChange={(e) => update("glow_radius", parseInt(e.target.value, 10))}
              />
              <div className="flex justify-between text-[10px] text-zinc-600 mt-0.5">
                <span>0px</span>
                <span>30px</span>
              </div>
            </div>
          </div>
        </div>

        {/* Icons & meta */}
        <div className="rounded-xl border border-zinc-700/60 bg-zinc-800/20 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">Icons & Metadaten</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Prefix-Icon <span className="text-zinc-600">(optional, Emoji/Symbol)</span></label>
              <input
                type="text"
                placeholder="z.B. ⚡ oder ✦"
                className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={form.prefix_icon}
                onChange={(e) => update("prefix_icon", e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Suffix-Icon <span className="text-zinc-600">(optional)</span></label>
              <input
                type="text"
                placeholder="z.B. ★"
                className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={form.suffix_icon}
                onChange={(e) => update("suffix_icon", e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-400">Preis (Credits)</label>
              <input
                type="number"
                min={0}
                step={100}
                className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                value={form.unlock_price_cr}
                onChange={(e) => update("unlock_price_cr", parseInt(e.target.value, 10) || 0)}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-purple-500"
                checked={form.can_win_from_case}
                onChange={(e) => update("can_win_from_case", e.target.checked)}
              />
              Aus Case gewinnbar
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded accent-purple-500"
                checked={form.is_special}
                onChange={(e) => update("is_special", e.target.checked)}
              />
              Speziell (nicht kaufbar)
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={!form.key || !form.label || isSaving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-700 px-6 py-3 text-sm font-semibold text-white hover:bg-purple-600 disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Style speichern / aktualisieren
        </button>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4: Shop-Verwaltung
// ─────────────────────────────────────────────────────────────────────────────

const RARITY_PRICE_DEFAULTS: Record<string, number> = NAME_STYLE_RARITY_PRICES;

function ShopStyleRow({
  row,
  onSave,
  saving,
}: {
  row: NameStyleShopRow;
  onSave: (key: string, opts: Parameters<typeof adminSetNameStyleShopAvailability>[1]) => Promise<void>;
  saving: boolean;
}) {
  const localDef = NAME_STYLES[row.key];
  const [available, setAvailable] = useState(row.availableInShop);
  const [price, setPrice] = useState(row.shopPriceCr || RARITY_PRICE_DEFAULTS[row.rarity] || 5000);
  const [stock, setStock] = useState<string>(row.shopStock !== null ? String(row.shopStock) : "");
  const [expires, setExpires] = useState(row.shopExpiresAt ? row.shopExpiresAt.split("T")[0] : "");
  const [sortOrder, setSortOrder] = useState(row.shopSortOrder);
  const rc = RARITY_COLORS[row.rarity as NameStyleRarity] ?? RARITY_COLORS["normal"];

  async function handleSave() {
    await onSave(row.key, {
      availableInShop: available,
      shopPriceCr: price,
      shopStock: stock !== "" ? Number(stock) : null,
      shopExpiresAt: expires ? new Date(expires).toISOString() : null,
      shopSortOrder: sortOrder,
    });
  }

  return (
    <div className={`rounded-xl border p-4 transition-all ${available ? "border-emerald-500/30 bg-emerald-950/10" : "border-zinc-700/60 bg-zinc-800/20"}`}>
      <div className="flex items-center gap-3 flex-wrap">
        {/* Style preview */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {localDef ? (
            <StyledUsername name={localDef.label} styleDef={localDef} size="sm" />
          ) : (
            <span className="text-sm font-medium text-zinc-200">{row.label}</span>
          )}
          <span
            className="shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold"
            style={{ color: rc.color, borderColor: rc.color + "44", background: rc.color + "11" }}
          >
            {rc.label}
          </span>
          <span className="text-[10px] font-mono text-zinc-600">{row.key}</span>
        </div>

        {/* Toggle */}
        <button
          onClick={() => setAvailable((v) => !v)}
          className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            available
              ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200"
              : "border-zinc-600 text-zinc-500 hover:border-zinc-400 hover:text-zinc-300"
          }`}
        >
          {available ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
          {available ? "Im Shop" : "Kein Shop"}
        </button>
      </div>

      {/* Settings — always visible so changes are easy */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-[10px] text-zinc-500">
          Preis (CR)
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value) || 0)}
            min={0}
            className="rounded-lg border border-zinc-700 bg-black/30 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-zinc-500">
          Bestand (leer = ∞)
          <input
            type="number"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            min={0}
            placeholder="∞"
            className="rounded-lg border border-zinc-700 bg-black/30 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-zinc-500">
          Ablaufdatum
          <input
            type="date"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            className="rounded-lg border border-zinc-700 bg-black/30 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-zinc-500">
          Reihenfolge
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            min={0}
            className="rounded-lg border border-zinc-700 bg-black/30 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-purple-400/60"
          />
        </label>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-3 flex items-center gap-1.5 rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-600 disabled:opacity-50 transition-colors"
      >
        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
        Speichern
      </button>
    </div>
  );
}

function ShopSection({ onFlash }: { onFlash: (type: "ok" | "err", msg: string) => void }) {
  const [rows, setRows] = useState<NameStyleShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterAvailable, setFilterAvailable] = useState<"all" | "active" | "inactive">("all");

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminGetNameStylesWithShopStatus();
      // Merge with local catalog — add any local styles not yet in DB
      const dbKeys = new Set(data.map((r) => r.key));
      const localMissing: NameStyleShopRow[] = Object.values(NAME_STYLES)
        .filter((s) => !dbKeys.has(s.key))
        .map((s) => ({
          key: s.key,
          label: s.label,
          rarity: s.rarity,
          availableInShop: false,
          shopPriceCr: RARITY_PRICE_DEFAULTS[s.rarity] || 5000,
          shopStock: null,
          shopExpiresAt: null,
          shopSortOrder: 0,
        }));
      setRows([...data, ...localMissing]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadRows(); }, [loadRows]);

  const handleSave = useCallback(async (
    key: string,
    opts: Parameters<typeof adminSetNameStyleShopAvailability>[1]
  ) => {
    setSavingKey(key);
    try {
      const res = await adminSetNameStyleShopAvailability(key, opts);
      if (res.ok) {
        onFlash("ok", `Shop-Status für "${key}" gespeichert.`);
        await loadRows();
      } else {
        onFlash("err", res.error ?? "Fehler beim Speichern.");
      }
    } finally {
      setSavingKey(null);
    }
  }, [loadRows, onFlash]);

  const filtered = rows.filter((r) => {
    const matchSearch = !search || r.key.includes(search.toLowerCase()) || r.label.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filterAvailable === "all"
      ? true
      : filterAvailable === "active"
        ? r.availableInShop
        : !r.availableInShop;
    return matchSearch && matchFilter;
  });

  const activeCount = rows.filter((r) => r.availableInShop).length;

  return (
    <div>
      <SectionHeader
        title="Shop-Verfügbarkeit"
        description="Steuere welche Name Styles im Shop kaufbar sind — mit Preis, Bestand und Ablaufdatum."
        icon={ShoppingBag}
      />

      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Style suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 py-2 pl-9 pr-4 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-zinc-700 bg-zinc-800/50 p-1">
          {(["all", "active", "inactive"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilterAvailable(f)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                filterAvailable === f ? "bg-purple-700 text-white" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {f === "all" ? `Alle (${rows.length})` : f === "active" ? `Im Shop (${activeCount})` : `Kein Shop (${rows.length - activeCount})`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-zinc-500">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <ShopStyleRow
              key={row.key}
              row={row}
              onSave={handleSave}
              saving={savingKey === row.key}
            />
          ))}
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-600">Keine Styles gefunden.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 5: Seltenheiten-Konfiguration
// ─────────────────────────────────────────────────────────────────────────────

const RARITY_ORDER: NameStyleRarity[] = ["ultra", "mythisch", "selten", "normal"];

function RarityConfigCard({
  config,
  onUpdate,
  onBulkPrice,
  saving,
}: {
  config: NameStyleRarityConfig;
  onUpdate: (rarity: NameStyleRarity, opts: Partial<NameStyleRarityConfig>) => Promise<void>;
  onBulkPrice: (rarity: NameStyleRarity, price: number) => Promise<void>;
  saving: boolean;
}) {
  const rc = RARITY_COLORS[config.rarity];
  const [basePrice, setBasePrice] = useState(config.baseShopPriceCr);
  const [maxPrice, setMaxPrice] = useState(config.maxShopPriceCr);
  const [dropWeight, setDropWeight] = useState(config.caseDropWeight);
  const [dropEnabled, setDropEnabled] = useState(config.caseDropEnabled);
  const [bpEnabled, setBpEnabled] = useState(config.bpRewardEnabled);
  const [bulkPrice, setBulkPrice] = useState(config.baseShopPriceCr);
  const [dirty, setDirty] = useState(false);

  const styleCount = STYLES_BY_RARITY[config.rarity].filter((s) => !s.is_special).length;

  async function handleSave() {
    await onUpdate(config.rarity, {
      baseShopPriceCr: basePrice,
      maxShopPriceCr: maxPrice,
      caseDropWeight: dropWeight,
      caseDropEnabled: dropEnabled,
      bpRewardEnabled: bpEnabled,
    });
    setDirty(false);
  }

  async function handleBulkPrice() {
    await onBulkPrice(config.rarity, bulkPrice);
  }

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{ borderColor: rc.color + "33", background: rc.color + "08" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="rounded-lg px-3 py-1.5 text-sm font-bold uppercase tracking-wider"
          style={{ color: rc.color, background: rc.color + "22" }}
        >
          {rc.label}
        </div>
        <span className="text-xs text-zinc-500">{styleCount} Styles</span>
        <div className="ml-auto flex gap-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
              bpEnabled ? "border-green-500/40 text-green-400 bg-green-950/30" : "border-zinc-600 text-zinc-600"
            }`}
          >
            BP: {bpEnabled ? "AN" : "AUS"}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
              dropEnabled ? "border-amber-500/40 text-amber-400 bg-amber-950/30" : "border-zinc-600 text-zinc-600"
            }`}
          >
            Case: {dropEnabled ? "AN" : "AUS"}
          </span>
        </div>
      </div>

      {/* Price settings */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs text-zinc-500">
          Basis-Shop-Preis (CR)
          <input
            type="number"
            value={basePrice}
            min={0}
            step={50000}
            onChange={(e) => { setBasePrice(Number(e.target.value)); setDirty(true); }}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-purple-500/60"
          />
          <span style={{ color: rc.color }} className="text-[10px] font-medium">
            {(basePrice).toLocaleString("de-DE")} CR
          </span>
        </label>
        <label className="flex flex-col gap-1.5 text-xs text-zinc-500">
          Max. Shop-Preis (CR)
          <input
            type="number"
            value={maxPrice}
            min={0}
            step={100000}
            onChange={(e) => { setMaxPrice(Number(e.target.value)); setDirty(true); }}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-purple-500/60"
          />
          <span className="text-[10px] font-medium text-zinc-600">
            {(maxPrice).toLocaleString("de-DE")} CR
          </span>
        </label>
      </div>

      {/* Case drop weight */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5 text-xs text-zinc-500">
          Case-Drop-Gewicht
          <input
            type="number"
            value={dropWeight}
            min={0}
            max={1000}
            onChange={(e) => { setDropWeight(Number(e.target.value)); setDirty(true); }}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-purple-500/60"
          />
          <span className="text-[10px] text-zinc-600">Höher = häufiger</span>
        </label>
        <div className="flex flex-col gap-2 justify-center">
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={dropEnabled}
              onChange={(e) => { setDropEnabled(e.target.checked); setDirty(true); }}
              className="h-4 w-4 accent-amber-500 rounded"
            />
            Case-Drop aktiviert
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={bpEnabled}
              onChange={(e) => { setBpEnabled(e.target.checked); setDirty(true); }}
              className="h-4 w-4 accent-green-500 rounded"
            />
            Battle-Pass-Belohnung
          </label>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 border-t border-zinc-700/40 pt-3">
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="flex items-center gap-1.5 rounded-lg bg-purple-700 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-600 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Konfiguration speichern
        </button>

        {/* Bulk price updater */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] text-zinc-600">Bulk-Preis:</span>
          <input
            type="number"
            value={bulkPrice}
            min={0}
            step={50000}
            onChange={(e) => setBulkPrice(Number(e.target.value))}
            className="w-32 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500/60"
          />
          <button
            onClick={handleBulkPrice}
            disabled={saving}
            className="flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-950/20 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-950/40 disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Alle {styleCount} Styles
          </button>
        </div>
      </div>

      <p className="text-[10px] text-zinc-600">
        Zuletzt aktualisiert: {new Date(config.updatedAt).toLocaleString("de-DE")}
      </p>
    </div>
  );
}

function SeltenheitenSection({ onFlash }: { onFlash: (type: "ok" | "err", msg: string) => void }) {
  const [configs, setConfigs] = useState<NameStyleRarityConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRarity, setSavingRarity] = useState<NameStyleRarity | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getNameStyleRarityConfigs();
      setConfigs(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleUpdate = useCallback(async (
    rarity: NameStyleRarity,
    opts: Partial<NameStyleRarityConfig>,
  ) => {
    setSavingRarity(rarity);
    try {
      const res = await adminUpdateNameStyleRarityConfig(rarity, opts);
      if (res.ok) {
        onFlash("ok", `${RARITY_COLORS[rarity].label}-Konfiguration gespeichert.`);
        await load();
      } else {
        onFlash("err", res.error ?? "Fehler beim Speichern.");
      }
    } finally {
      setSavingRarity(null);
    }
  }, [load, onFlash]);

  const handleBulkPrice = useCallback(async (rarity: NameStyleRarity, price: number) => {
    setSavingRarity(rarity);
    try {
      const res = await adminBulkUpdateStylePricesByRarity(rarity, price);
      if (res.ok) {
        onFlash("ok", `Alle ${RARITY_COLORS[rarity].label}-Styles auf ${price.toLocaleString("de-DE")} CR gesetzt.`);
      } else {
        onFlash("err", res.error ?? "Fehler beim Bulk-Update.");
      }
    } finally {
      setSavingRarity(null);
    }
  }, [onFlash]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const sorted = [...configs].sort(
    (a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity)
  );

  return (
    <div>
      <SectionHeader
        title="Seltenheiten-Konfiguration"
        description="Preisstufen, Case-Drop-Gewichte und Unlock-Quellen pro Seltenheitsstufe einstellen."
        icon={Palette}
      />

      <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-950/10 px-4 py-3 text-xs text-amber-300">
        <span className="font-bold">Achtung:</span> &ldquo;Basis-Shop-Preis&rdquo; ist der Standardpreis für neue Shop-Slots dieser Seltenheit.
        &ldquo;Alle X Styles&rdquo; überschreibt <em>sofort</em> alle unlock_price_cr + shop_price_cr in der DB für nicht-spezielle Styles dieser Seltenheit.
      </div>

      <div className="space-y-4">
        {sorted.map((cfg) => (
          <RarityConfigCard
            key={cfg.rarity}
            config={cfg}
            onUpdate={handleUpdate}
            onBulkPrice={handleBulkPrice}
            saving={savingRarity === cfg.rarity}
          />
        ))}
        {sorted.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-600">
            Keine Konfiguration gefunden. Bitte Migration ausführen.
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function NameStylesTab({ profiles }: NameStylesTabProps) {
  const [activeSection, setActiveSection] = useState<SectionTab>("katalog");
  const [userStyles, setUserStyles] = useState<Record<string, string[]>>({});
  const [loadingUserStyles, setLoadingUserStyles] = useState(true);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [warnTarget, setWarnTarget] = useState<ProfileRow | null>(null);
  const { flash, show: showFlash } = useFlash();

  const loadUserStyles = useCallback(async () => {
    setLoadingUserStyles(true);
    try {
      const data = await adminGetAllUserStyles();
      setUserStyles(data);
    } finally {
      setLoadingUserStyles(false);
    }
  }, []);

  useEffect(() => {
    void loadUserStyles();
  }, [loadUserStyles]);

  const handleGrant = useCallback(async (userId: string, styleKey: string) => {
    const key = `grant-${userId}-${styleKey}`;
    setLoadingKey(key);
    try {
      const res = await adminGrantNameStyle(userId, styleKey);
      if (res.ok) {
        showFlash("ok", `Style "${styleKey}" an Benutzer vergeben.`);
        await loadUserStyles();
      } else {
        showFlash("err", res.error ?? "Fehler beim Vergeben.");
      }
    } finally {
      setLoadingKey(null);
    }
  }, [loadUserStyles, showFlash]);

  const handleRevoke = useCallback(async (userId: string, styleKey: string) => {
    const key = `revoke-${userId}-${styleKey}`;
    setLoadingKey(key);
    try {
      const res = await adminRevokeNameStyle(userId, styleKey);
      if (res.ok) {
        showFlash("ok", `Style "${styleKey}" entzogen.`);
        await loadUserStyles();
      } else {
        showFlash("err", res.error ?? "Fehler beim Entziehen.");
      }
    } finally {
      setLoadingKey(null);
    }
  }, [loadUserStyles, showFlash]);

  const handleForceEquip = useCallback(async (userId: string, styleKey: string | null) => {
    setLoadingKey(`equip-${userId}`);
    try {
      const res = await adminForceEquipStyle(userId, styleKey);
      if (res.ok) {
        showFlash("ok", `Style "${styleKey ?? "Standard"}" erzwungen.`);
      } else {
        showFlash("err", res.error ?? "Fehler beim Erzwingen.");
      }
    } finally {
      setLoadingKey(null);
    }
  }, [showFlash]);

  const handleWarn = useCallback(async (userId: string, note: string) => {
    setLoadingKey(`warn-${userId}`);
    try {
      const res = await adminWarnUser(userId, note);
      if (res.ok) {
        showFlash("ok", "Verwarnung ausgesprochen.");
        setWarnTarget(null);
      } else {
        showFlash("err", res.error ?? "Fehler bei der Verwarnung.");
      }
    } finally {
      setLoadingKey(null);
    }
  }, [showFlash]);

  const handleClearWarnings = useCallback(async (userId: string) => {
    setLoadingKey(`clearwarn-${userId}`);
    try {
      const res = await adminClearWarnings(userId);
      if (res.ok) {
        showFlash("ok", "Verwarnungen gelöscht.");
        // Optimistically update profiles is not possible without re-fetching,
        // but the parent won't refetch here; user can reload if needed.
      } else {
        showFlash("err", res.error ?? "Fehler beim Löschen.");
      }
    } finally {
      setLoadingKey(null);
    }
  }, [showFlash]);

  const handleUpsertStyle = useCallback(async (data: Partial<NameStyleDef> & { key: string }) => {
    setLoadingKey("upsert");
    try {
      const res = await adminUpsertNameStyle(data);
      if (res.ok) {
        showFlash("ok", `Style "${data.key}" gespeichert.`);
      } else {
        showFlash("err", res.error ?? "Fehler beim Speichern.");
      }
    } finally {
      setLoadingKey(null);
    }
  }, [showFlash]);

  const SECTIONS: { id: SectionTab; label: string }[] = [
    { id: "katalog",       label: "Style-Katalog" },
    { id: "shop",          label: "Shop-Verfügbarkeit" },
    { id: "seltenheiten",  label: "Seltenheiten" },
    { id: "vergeben",      label: "Vergeben / Entziehen" },
    { id: "erstellen",     label: "Custom Styles" },
  ];

  return (
    <div className="min-h-screen text-zinc-200">
      <FlashBanner flash={flash} />

      {/* Tab navigation */}
      <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-zinc-700/60 bg-zinc-800/40 p-1">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              activeSection === s.id
                ? "bg-purple-700 text-white shadow"
                : "text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-200"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Loading indicator for user styles */}
      {loadingUserStyles && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-4 py-2 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Lade Benutzer-Styles...
        </div>
      )}

      {/* Section content */}
      <div>
        {activeSection === "katalog" && (
          <KatalogSection
            profiles={profiles}
            userStyles={userStyles}
            onGrant={handleGrant}
            onRevoke={handleRevoke}
            onForceEquip={handleForceEquip}
            loadingKey={loadingKey}
            onCreateNew={() => setActiveSection("erstellen")}
          />
        )}
        {activeSection === "vergeben" && (
          <VergebenSection
            profiles={profiles}
            userStyles={userStyles}
            onGrant={handleGrant}
            onRevoke={handleRevoke}
            onForceEquip={handleForceEquip}
            onWarn={setWarnTarget}
            onClearWarnings={handleClearWarnings}
            loadingKey={loadingKey}
          />
        )}
        {activeSection === "shop" && (
          <ShopSection onFlash={showFlash} />
        )}
        {activeSection === "seltenheiten" && (
          <SeltenheitenSection onFlash={showFlash} />
        )}
        {activeSection === "erstellen" && (
          <ErstellenSection
            onSave={handleUpsertStyle}
            loadingKey={loadingKey}
          />
        )}
      </div>

      {/* Warn modal */}
      {warnTarget && (
        <WarnModal
          user={warnTarget}
          onClose={() => setWarnTarget(null)}
          onWarn={handleWarn}
          loading={loadingKey === `warn-${warnTarget.id}`}
        />
      )}
    </div>
  );
}
