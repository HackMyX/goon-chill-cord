"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Loader2, Check, Coins, Palette, Zap } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import { getShopExtras, purchaseShopExtra, type ShopExtra } from "@/lib/actions/shop-extras";
import { UniversalPreviewModal, type PreviewSubject } from "@/components/ui/universal-preview-modal";

const RARITY_COL: Record<string, string> = {
  selten: "#60a5fa", mythisch: "#c084fc", ultra: "#fbbf24", normal: "#9ca3af",
};
const RARITY_LABEL: Record<string, string> = {
  selten: "Selten", mythisch: "Mythisch", ultra: "Ultra", normal: "Normal",
};

function extraToSubject(e: ShopExtra): PreviewSubject {
  if (e.type === "name_style") {
    return { kind: "name_style", styleKey: e.key, displayName: e.name };
  }
  return {
    kind: "ability",
    abilityKey: e.key,
    name: e.name,
    description: e.description,
    category: e.category,
    rarity: e.rarity,
    icon: e.icon,
  };
}

/**
 * Shop section for non-item givables (abilities + name styles flagged
 * "Im Shop verfügbar"). Always-available offers, bought via purchaseShopExtra,
 * with a 3D preview on click (reuses the universal preview engine).
 */
export function ShopExtrasSection({ credits, onCreditsChange }: { credits: number; onCreditsChange: (c: number) => void }) {
  const [extras, setExtras] = useState<ShopExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewSubject | null>(null);
  const sound = useSoundManager();

  const load = useCallback(async () => {
    try { setExtras(await getShopExtras()); } catch { /* silent */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const buy = async (e: ShopExtra) => {
    if (e.owned || credits < e.priceCr) return;
    setBusyKey(`${e.type}:${e.key}`);
    setError(null);
    sound.click();
    try {
      const res = await purchaseShopExtra({ type: e.type, key: e.key });
      if (!res.ok) { setError(res.error ?? "Kauf fehlgeschlagen."); sound.error?.(); }
      else {
        sound.purchaseSuccess?.();
        onCreditsChange(credits - e.priceCr);
        await load();
      }
    } finally { setBusyKey(null); }
  };

  if (loading) {
    return <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-purple-400" /></div>;
  }
  if (extras.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-base font-black text-zinc-100">
        <Sparkles className="h-4.5 w-4.5 text-purple-300" /> Fähigkeiten &amp; Styles
      </h2>
      {error && <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {extras.map((e) => {
          const col = RARITY_COL[e.rarity] ?? "#a78bfa";
          const key = `${e.type}:${e.key}`;
          const Icon = e.type === "name_style" ? Palette : Zap;
          const cant = e.owned || credits < e.priceCr;
          return (
            <div key={key} className="flex flex-col overflow-hidden rounded-2xl border bg-white/[0.02] p-3"
              style={{ borderColor: `${col}33`, boxShadow: `inset 0 0 30px -22px ${col}` }}>
              <button onClick={() => { sound.hover(); setPreview(extraToSubject(e)); }}
                className="mb-2 flex flex-col items-center gap-1.5 rounded-xl py-3 transition-transform hover:scale-[1.03]"
                style={{ background: `radial-gradient(circle at 50% 30%, ${col}22 0%, transparent 70%)` }}>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: `${col}1f`, color: col }}>
                  <Icon className="h-6 w-6" />
                </span>
                <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest"
                  style={{ background: `${col}20`, color: col }}>{RARITY_LABEL[e.rarity] ?? e.rarity}</span>
              </button>
              <p className="truncate text-center text-sm font-bold text-white">{e.name}</p>
              {e.description && <p className="mb-2 line-clamp-2 min-h-[28px] text-center text-[10px] leading-snug text-zinc-500">{e.description}</p>}
              <button
                onClick={() => buy(e)}
                disabled={cant || busyKey === key}
                className={`mt-auto flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-black transition-colors ${
                  e.owned ? "bg-emerald-500/15 text-emerald-300"
                  : credits < e.priceCr ? "bg-zinc-800 text-zinc-500"
                  : "bg-purple-600/90 text-white hover:bg-purple-500"
                }`}
              >
                {busyKey === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : e.owned ? <><Check className="h-3.5 w-3.5" /> Besitzt du</>
                  : <><Coins className="h-3.5 w-3.5" /> {e.priceCr.toLocaleString("de-DE")}</>}
              </button>
            </div>
          );
        })}
      </div>
      {preview && <UniversalPreviewModal subject={preview} onClose={() => setPreview(null)} />}
    </section>
  );
}
