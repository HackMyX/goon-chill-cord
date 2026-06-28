"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gift, X, Ticket, Gamepad2, Loader2, Clock, Sparkles, PackageOpen, Dice5, Disc3,
} from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import { openCase } from "@/lib/actions/cases";
import {
  getMyRewardWallet, getOpenableCases,
  type CaseTokenView, type GameBonusView, type OpenableCaseView,
} from "@/lib/actions/rewards";

const RARITY_COLOR: Record<string, string> = {
  normal: "#9ca3af", selten: "#38bdf8", mythisch: "#a855f7", ultra: "#f59e0b",
};
const RARITY_LABEL: Record<string, string> = {
  normal: "Normal", selten: "Selten", mythisch: "Mythisch", ultra: "Ultra",
};
const GAME_ICON: Record<string, typeof Disc3> = { plinko: Disc3, snake: Gamepad2, don: Dice5 };

function relExpiry(iso: string | null): string | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "abgelaufen";
  const h = Math.floor(diff / 3_600_000);
  if (h < 1) return `${Math.max(1, Math.floor(diff / 60_000))} min`;
  if (h < 24) return `${h} Std`;
  return `${Math.floor(h / 24)} T`;
}

interface RevealDrop { name: string; rarity: string; kind: string }

function Reveal({ drop, onClose }: { drop: RevealDrop; onClose: () => void }) {
  const col = RARITY_COLOR[drop.rarity] ?? "#9ca3af";
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.8, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex w-[min(90vw,340px)] flex-col items-center gap-3 rounded-3xl border p-8 text-center"
        style={{ borderColor: `${col}66`, background: "#0a0a12f2", boxShadow: `0 0 80px -10px ${col}` }}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 rounded-3xl opacity-40"
          style={{ background: `radial-gradient(ellipse at 50% 0%, ${col}55 0%, transparent 65%)` }} />
        <span className="relative text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: col }}>
          {RARITY_LABEL[drop.rarity] ?? drop.rarity}-Drop
        </span>
        <PackageOpen className="relative h-12 w-12" style={{ color: col }} />
        <p className="relative text-xl font-black text-white">{drop.name}</p>
        <button onClick={onClose} className="relative mt-1 rounded-xl bg-white/10 px-5 py-2 text-sm font-bold text-zinc-200 transition-colors hover:bg-white/15">
          Stark!
        </button>
      </motion.div>
    </div>
  );
}

function CaseTokenCard({
  token, openableCases, busy, onOpen,
}: {
  token: CaseTokenView;
  openableCases: OpenableCaseView[];
  busy: boolean;
  onOpen: (tierId: string, tokenId: string) => void;
}) {
  const [pick, setPick] = useState("");
  const col = token.rarityFloor ? RARITY_COLOR[token.rarityFloor] ?? "#a78bfa" : "#a78bfa";
  const expiry = relExpiry(token.expiresAt);
  const title = token.mode === "rarity"
    ? `Gratis-Case · mind. ${RARITY_LABEL[token.rarityFloor ?? "normal"]}`
    : token.tierLabel ?? "Gratis-Case";

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3" style={{ boxShadow: `inset 0 0 24px -16px ${col}` }}>
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${col}22`, color: col }}>
          <Ticket className="h-4.5 w-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{title}</p>
          <p className="text-[10px] text-zinc-500">
            {token.mode === "tier" && token.groupTitle ? token.groupTitle : "Beliebiges Case"}
            {expiry && <> · <span className="text-amber-400/80"><Clock className="mr-0.5 inline h-2.5 w-2.5" />{expiry}</span></>}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        {token.mode === "rarity" && (
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 outline-none focus:border-violet-400/50"
          >
            <option value="">Case wählen…</option>
            {openableCases.map((c) => <option key={c.tierId} value={c.tierId}>{c.groupTitle} · {c.label}</option>)}
          </select>
        )}
        <button
          onClick={() => onOpen(token.mode === "tier" ? (token.tierId ?? "") : pick, token.id)}
          disabled={busy || (token.mode === "rarity" && !pick) || (token.mode === "tier" && !token.tierId)}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600/90 px-3 py-1.5 text-xs font-black text-white transition-colors hover:bg-violet-500 disabled:opacity-40"
          style={token.mode === "rarity" ? undefined : { flex: 1 }}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Sparkles className="h-3.5 w-3.5" /> Gratis öffnen</>}
        </button>
      </div>
    </div>
  );
}

function WalletPanel({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [caseTokens, setCaseTokens] = useState<CaseTokenView[]>([]);
  const [gameBonuses, setGameBonuses] = useState<GameBonusView[]>([]);
  const [openable, setOpenable] = useState<OpenableCaseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<RevealDrop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sound = useSoundManager();

  const load = useCallback(async () => {
    const [wallet, cases] = await Promise.all([getMyRewardWallet(), getOpenableCases()]);
    setCaseTokens(wallet.caseTokens);
    setGameBonuses(wallet.gameBonuses);
    setOpenable(cases);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const handleOpen = async (tierId: string, tokenId: string) => {
    if (!tierId) return;
    setBusyId(tokenId);
    setError(null);
    sound.click();
    try {
      const res = await openCase(tierId, tokenId);
      if (!res.success || !res.drop) {
        setError(res.error ?? "Öffnen fehlgeschlagen.");
        sound.error();
      } else {
        sound.caseReveal?.();
        setReveal({ name: res.drop.name, rarity: res.drop.rarity, kind: res.drop.kind });
        await load();
        onChanged();
      }
    } finally { setBusyId(null); }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, x: 40, scale: 0.98 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        exit={{ opacity: 0, x: 40, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        className="fixed right-3 top-[64px] z-[140] flex max-h-[min(82vh,720px)] w-[min(94vw,400px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a12]/95 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-50"
          style={{ background: "radial-gradient(ellipse at 20% 0%, #7c3aed55 0%, transparent 60%), radial-gradient(ellipse at 90% 10%, #f59e0b44 0%, transparent 55%)" }} />

        <div className="relative flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
            <Gift className="h-4.5 w-4.5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-black tracking-tight text-white">Meine Gutscheine</h2>
            <p className="text-[10px] text-zinc-500">{caseTokens.length} Case-Token · {gameBonuses.length} Spiel-Boni</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-white/10 bg-white/5 p-1.5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-zinc-200" aria-label="Schließen">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "thin" }}>
          {loading ? (
            <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-amber-400" /></div>
          ) : caseTokens.length === 0 && gameBonuses.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 px-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.03] text-zinc-600"><Gift className="h-6 w-6" /></div>
              <p className="text-xs text-zinc-500">Keine Gutscheine. Löse einen Code ein oder warte auf Belohnungen!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}

              {caseTokens.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                    <Ticket className="h-3 w-3" /> Case-Gutscheine ({caseTokens.length})
                  </p>
                  <div className="space-y-2">
                    {caseTokens.map((t) => (
                      <CaseTokenCard key={t.id} token={t} openableCases={openable} busy={busyId === t.id} onOpen={handleOpen} />
                    ))}
                  </div>
                </div>
              )}

              {gameBonuses.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                    <Gamepad2 className="h-3 w-3" /> Spiel-Boni ({gameBonuses.length})
                  </p>
                  <div className="space-y-2">
                    {gameBonuses.map((b) => {
                      const Icon = GAME_ICON[b.game] ?? Gamepad2;
                      const expiry = relExpiry(b.nextExpiry);
                      return (
                        <div key={b.game} className="flex items-center gap-3 rounded-2xl border border-amber-400/20 bg-amber-500/[0.05] p-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300"><Icon className="h-4.5 w-4.5" /></div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-white">+{b.remaining} {b.gameLabel}</p>
                            <p className="text-[10px] text-zinc-500">
                              Automatisch über dem Limit nutzbar{expiry && <> · <span className="text-amber-400/80">{expiry}</span></>}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="mt-2 px-1 text-[10px] leading-relaxed text-zinc-600">
                    Spiel-Boni werden im jeweiligen Spiel automatisch eingesetzt, sobald dein Stunden-/Tageslimit erreicht ist.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {reveal && <Reveal drop={reveal} onClose={() => setReveal(null)} />}
    </>
  );
}

export function RewardWalletTrigger({ userId }: { userId?: string }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const sound = useSoundManager();
  const firstLoad = useRef(true);

  useEffect(() => { setMounted(true); }, []);

  const refreshCount = useCallback(async () => {
    try {
      const w = await getMyRewardWallet();
      setCount(w.caseTokens.length + w.gameBonuses.length);
    } catch { /* silent */ } finally { firstLoad.current = false; }
  }, []);

  useEffect(() => {
    if (!userId) return;
    void refreshCount();
    const t = setInterval(refreshCount, 60_000);
    return () => clearInterval(t);
  }, [userId, refreshCount]);

  // Cross-link: open from anywhere (e.g. a "you got a voucher" notification).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("gn:open-rewards", onOpen);
    return () => window.removeEventListener("gn:open-rewards", onOpen);
  }, []);

  if (!userId) return null;

  return (
    <>
      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <>
              <div key="bg" className="fixed inset-0 z-[139]" onClick={() => setOpen(false)} />
              <WalletPanel onClose={() => setOpen(false)} onChanged={refreshCount} />
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <button
        onClick={() => { setOpen((o) => !o); sound.click(); }}
        onMouseEnter={sound.hover}
        title="Meine Gutscheine"
        className={`relative flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
          count > 0
            ? "border-amber-400/50 bg-amber-500/10 text-amber-300 shadow-[0_0_14px_-2px_rgba(245,158,11,0.6)]"
            : "border-white/[0.08] bg-zinc-900/80 text-zinc-400 hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-300"
        }`}
      >
        <Gift className="h-4.5 w-4.5" />
        {count > 0 && (
          <>
            <span aria-hidden className="absolute -top-1 -right-1 inline-flex h-4 w-4 animate-ping rounded-full bg-amber-500/60" />
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-black text-white"
            >
              {count}
            </motion.span>
          </>
        )}
      </button>
    </>
  );
}
