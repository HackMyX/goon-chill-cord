import type { CSSProperties } from "react";

export type NameStyleRarity = "normal" | "selten" | "mythisch" | "ultra";
export type AnimationType =
  | "none" | "shimmer" | "pulse" | "wave" | "rainbow" | "prismatic"
  | "flicker" | "glitch" | "matrix" | "hologram" | "obfuscated" | "rgb_wave"
  | "aurora" | "fire" | "electric" | "cyber" | "neon_glow" | "blood_moon"
  | "venom" | "starfield" | "divine" | "chaos";

export interface NameStyleDef {
  key: string;
  label: string;
  description: string;
  rarity: NameStyleRarity;
  category: "solid" | "gradient" | "glow" | "animated" | "special";
  color1: string;
  color2?: string;
  color3?: string;
  color4?: string;
  animation_type: AnimationType;
  animation_speed: number;
  glow_color?: string;
  glow_radius: number;
  prefix_icon?: string;
  suffix_icon?: string;
  unlock_price_cr: number;
  can_win_from_case: boolean;
  is_special: boolean;
}

export const RARITY_COLORS: Record<NameStyleRarity, { label: string; color: string; border: string; bg: string }> = {
  normal:   { label: "Normal",    color: "#a1a1aa", border: "border-zinc-600",   bg: "bg-zinc-900"         },
  selten:   { label: "Selten",    color: "#60a5fa", border: "border-blue-500/40", bg: "bg-blue-950/30"     },
  mythisch: { label: "Mythisch",  color: "#c084fc", border: "border-purple-500/40", bg: "bg-purple-950/30" },
  ultra:    { label: "Ultra",     color: "#f59e0b", border: "border-amber-500/40", bg: "bg-amber-950/30"   },
};

/** CSS animation class per animation type — defined in globals.css */
export const ANIM_CLASS: Record<AnimationType, string> = {
  none:        "",
  shimmer:     "ns-shimmer",
  pulse:       "ns-pulse",
  wave:        "ns-wave",
  rainbow:     "ns-rainbow",
  prismatic:   "ns-prismatic",
  flicker:     "ns-flicker",
  glitch:      "ns-glitch",
  matrix:      "ns-matrix",
  hologram:    "ns-hologram",
  obfuscated:  "ns-obfuscated",
  rgb_wave:    "",             // handled in JS (per-character)
  aurora:      "ns-aurora",
  fire:        "ns-fire",
  electric:    "ns-electric",
  cyber:       "ns-cyber",
  neon_glow:   "ns-neon-glow",
  blood_moon:  "ns-blood-moon",
  venom:       "ns-venom",
  starfield:   "ns-starfield",
  divine:      "ns-divine",
  chaos:       "ns-chaos",
};

/** Compute inline CSSProperties for a NameStyleDef */
export function computeNameStyleCSS(style: NameStyleDef): CSSProperties {
  const isGradient = Boolean(style.color2);
  const speed = 2 / (style.animation_speed || 1);
  const animType = style.animation_type;

  if (animType === "matrix") {
    return {
      color: "#00ff41",
      textShadow: `0 0 8px #00ff41, 0 0 20px #00ff41, 0 0 40px #003b00`,
      fontFamily: "monospace",
      animationDuration: `${speed}s`,
    };
  }

  if (animType === "glitch") {
    return { color: "#ffffff", animationDuration: `${speed * 0.3}s` };
  }

  if (animType === "hologram") {
    const colors = [style.color1, style.color2, style.color3].filter(Boolean).join(", ");
    return {
      backgroundImage: isGradient ? `linear-gradient(90deg, ${colors}, ${style.color1})` : undefined,
      backgroundSize: "200% auto",
      backgroundClip: isGradient ? "text" : undefined,
      WebkitBackgroundClip: isGradient ? "text" : undefined,
      WebkitTextFillColor: isGradient ? "transparent" : undefined,
      color: isGradient ? "transparent" : style.color1,
      opacity: 0.9,
      animationDuration: `${speed * 1.5}s`,
    };
  }

  if (animType === "blood_moon") {
    return {
      color: style.color1,
      textShadow: `0 0 ${style.glow_radius}px ${style.glow_color ?? "#7f1d1d"}, 0 0 ${style.glow_radius * 2}px ${style.glow_color ?? "#7f1d1d"}50`,
      animationDuration: `${speed * 1.5}s`,
    };
  }

  if (animType === "electric" || animType === "starfield") {
    return {
      color: style.color1,
      textShadow: style.glow_color
        ? `0 0 ${style.glow_radius}px ${style.glow_color}, 0 0 ${style.glow_radius * 2}px ${style.glow_color}60`
        : undefined,
      animationDuration: `${speed}s`,
    };
  }

  if (animType === "neon_glow") {
    return {
      color: style.color1,
      textShadow: style.glow_color
        ? `0 0 ${style.glow_radius}px ${style.glow_color}, 0 0 ${style.glow_radius * 1.5}px ${style.glow_color}80, 0 0 ${style.glow_radius * 3}px ${style.glow_color}30`
        : undefined,
      animationDuration: `${speed}s`,
    };
  }

  if (animType === "venom") {
    return {
      color: style.color1,
      textShadow: style.glow_color
        ? `0 0 ${style.glow_radius}px ${style.glow_color}`
        : undefined,
      animationDuration: `${speed}s`,
    };
  }

  if (isGradient) {
    const colors = [style.color1, style.color2, style.color3, style.color4]
      .filter(Boolean)
      .join(", ");
    return {
      backgroundImage: `linear-gradient(135deg, ${colors}, ${style.color1})`,
      backgroundSize: "200% auto",
      backgroundClip: "text",
      WebkitBackgroundClip: "text",
      WebkitTextFillColor: "transparent",
      color: "transparent",
      filter: style.glow_color && style.glow_radius > 0
        ? `drop-shadow(0 0 ${style.glow_radius / 2}px ${style.glow_color})`
        : undefined,
      animationDuration: `${speed}s`,
    };
  }

  // Solid / glow
  return {
    color: style.color1,
    textShadow: style.glow_color && style.glow_radius > 0
      ? `0 0 ${style.glow_radius}px ${style.glow_color}, 0 0 ${style.glow_radius * 2}px ${style.glow_color}60`
      : undefined,
    animationDuration: `${speed}s`,
  };
}

/** Canonical catalog — mirrors what's in the DB */
export const NAME_STYLES: Record<string, NameStyleDef> = {

  // ══════════════════════════════ NORMAL ════════════════════════════════════════

  default:         { key:"default",         label:"Standard",           description:"Schlichtes Weiß.",                                   rarity:"normal",   category:"solid",    color1:"#f4f4f5",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:0,        can_win_from_case:false, is_special:false },
  warm_white:      { key:"warm_white",      label:"Warmes Weiß",        description:"Cremiges, warmes Weiß.",                             rarity:"normal",   category:"solid",    color1:"#fef3c7",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  sky:             { key:"sky",             label:"Himmelblau",         description:"Beruhigendes Himmelblau.",                           rarity:"normal",   category:"solid",    color1:"#7dd3fc",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  mint:            { key:"mint",            label:"Mintgrün",           description:"Frisches Mint.",                                     rarity:"normal",   category:"solid",    color1:"#6ee7b7",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  rose:            { key:"rose",            label:"Rose",               description:"Zart-rosiges Pink.",                                 rarity:"normal",   category:"solid",    color1:"#fda4af",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  slate:           { key:"slate",           label:"Slate",              description:"Kühles Blau-Grau.",                                  rarity:"normal",   category:"solid",    color1:"#94a3b8",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  amber_warm:      { key:"amber_warm",      label:"Bernstein",          description:"Warmes, saftiges Amber-Gold.",                       rarity:"normal",   category:"solid",    color1:"#f59e0b",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  lavender:        { key:"lavender",        label:"Lavendel",           description:"Sanftes Lavendel-Lila.",                             rarity:"normal",   category:"solid",    color1:"#c4b5fd",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  peach:           { key:"peach",           label:"Pfirsich",           description:"Weiches Pfirsich-Orange.",                           rarity:"normal",   category:"solid",    color1:"#fdba74",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  coral:           { key:"coral",           label:"Koralle",            description:"Lebendiges Korallen-Orange.",                        rarity:"normal",   category:"solid",    color1:"#fb923c",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  lime_bright:     { key:"lime_bright",     label:"Limette",            description:"Knalliges Limetten-Grün.",                           rarity:"normal",   category:"solid",    color1:"#a3e635",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  cherry_red:      { key:"cherry_red",      label:"Kirsche",            description:"Tiefes Kirsch-Rot.",                                 rarity:"normal",   category:"solid",    color1:"#e11d48",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  deep_ocean:      { key:"deep_ocean",      label:"Ozean",              description:"Tiefes Ozean-Blau.",                                 rarity:"normal",   category:"solid",    color1:"#0ea5e9",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  moss:            { key:"moss",            label:"Waldmoos",           description:"Dunkles Waldgrün.",                                  rarity:"normal",   category:"solid",    color1:"#4ade80",                                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },
  storm_grey:      { key:"storm_grey",      label:"Sturmgrau",          description:"Gedämpftes Gewittergrau mit Schimmer.",               rarity:"normal",   category:"animated", color1:"#a1a1aa", color2:"#d4d4d8",                                   animation_type:"shimmer",    animation_speed:0.6, glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000,    can_win_from_case:true,  is_special:false },

  // ══════════════════════════════ SELTEN ════════════════════════════════════════

  fire:            { key:"fire",            label:"Feuerrot",           description:"Lodernd wie Flammen.",                              rarity:"selten",   category:"animated", color1:"#ff6b00", color2:"#ff0000", color3:"#ffaa00",                   animation_type:"shimmer",    animation_speed:1.2, glow_color:"#ff4400",  glow_radius:8,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  ice:             { key:"ice",             label:"Eisblau",            description:"Glitzernd wie Eis.",                                rarity:"selten",   category:"animated", color1:"#bfdbfe", color2:"#60a5fa", color3:"#e0f2fe",                   animation_type:"shimmer",    animation_speed:0.8, glow_color:"#3b82f6",  glow_radius:6,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  toxic:           { key:"toxic",           label:"Giftgrün",           description:"Giftig leuchtend.",                                 rarity:"selten",   category:"glow",     color1:"#4ade80",                                                       animation_type:"pulse",      animation_speed:1,   glow_color:"#22c55e",  glow_radius:10, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  gold_shine:      { key:"gold_shine",      label:"Goldglanz",          description:"Schimmerndes Gold.",                                rarity:"selten",   category:"animated", color1:"#fbbf24", color2:"#f59e0b", color3:"#fde68a",                   animation_type:"shimmer",    animation_speed:1.5, glow_color:"#f59e0b",  glow_radius:6,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  neon_pink:       { key:"neon_pink",       label:"Neon Pink",          description:"Knalliges Neon-Pink.",                              rarity:"selten",   category:"glow",     color1:"#f472b6",                                                       animation_type:"pulse",      animation_speed:1.2, glow_color:"#ec4899",  glow_radius:10, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  neon_cyan:       { key:"neon_cyan",       label:"Neon Cyan",          description:"Elektrisches Cyan-Leuchten.",                       rarity:"selten",   category:"glow",     color1:"#22d3ee",                                                       animation_type:"pulse",      animation_speed:1.2, glow_color:"#06b6d4",  glow_radius:10, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  blood:           { key:"blood",           label:"Blutrot",            description:"Tiefes Karmesinrot, bedrohlich.",                   rarity:"selten",   category:"glow",     color1:"#dc2626",                                                       animation_type:"pulse",      animation_speed:0.8, glow_color:"#991b1b",  glow_radius:8,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  poison:          { key:"poison",          label:"Gift",               description:"Giftsäure-Grün, zischend.",                         rarity:"selten",   category:"animated", color1:"#84cc16", color2:"#365314",                                     animation_type:"wave",       animation_speed:0.8, glow_color:"#65a30d",  glow_radius:8,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  neon_green:      { key:"neon_green",      label:"Neon Grün",          description:"Hyper-grünes Neon-Leuchten.",                       rarity:"selten",   category:"glow",     color1:"#39ff14",                                                       animation_type:"neon_glow",  animation_speed:1,   glow_color:"#22c55e",  glow_radius:14, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  neon_orange:     { key:"neon_orange",     label:"Neon Orange",        description:"Aggressives Neon-Orange.",                          rarity:"selten",   category:"glow",     color1:"#ff6b00",                                                       animation_type:"neon_glow",  animation_speed:1.1, glow_color:"#f97316",  glow_radius:12, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  neon_yellow:     { key:"neon_yellow",     label:"Neon Gelb",          description:"Blendend helles Neon-Gelb.",                        rarity:"selten",   category:"glow",     color1:"#ffff00",                                                       animation_type:"neon_glow",  animation_speed:0.9, glow_color:"#eab308",  glow_radius:12, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  purple_haze:     { key:"purple_haze",     label:"Purple Haze",        description:"Mystischer Lila-Dunst-Shimmer.",                    rarity:"selten",   category:"animated", color1:"#a855f7", color2:"#6d28d9", color3:"#c084fc",                   animation_type:"shimmer",    animation_speed:1.3, glow_color:"#7c3aed",  glow_radius:8,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  sunset_grad:     { key:"sunset_grad",     label:"Sonnenuntergang",    description:"Warmer Orange-Pink-Lila-Farbverlauf.",               rarity:"selten",   category:"animated", color1:"#f97316", color2:"#ec4899", color3:"#a855f7",                   animation_type:"shimmer",    animation_speed:1.2, glow_color:"#f97316",  glow_radius:6,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  deep_sea:        { key:"deep_sea",        label:"Tiefsee",            description:"Dunkles Tiefsee-Cyan-Blau.",                        rarity:"selten",   category:"animated", color1:"#0891b2", color2:"#0e7490", color3:"#22d3ee",                   animation_type:"wave",       animation_speed:0.7, glow_color:"#0891b2",  glow_radius:8,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  ember:           { key:"ember",           label:"Glut",               description:"Tiefes Glutrot-Orange, schwelend.",                 rarity:"selten",   category:"glow",     color1:"#ea580c",                                                       animation_type:"pulse",      animation_speed:0.9, glow_color:"#dc2626",  glow_radius:10, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  sapphire:        { key:"sapphire",        label:"Saphir",             description:"Edles Saphir-Blau mit Shimmer.",                    rarity:"selten",   category:"animated", color1:"#2563eb", color2:"#3b82f6", color3:"#bfdbfe",                   animation_type:"shimmer",    animation_speed:1,   glow_color:"#3b82f6",  glow_radius:8,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  plasma:          { key:"plasma",          label:"Plasma",             description:"Elektrisches Plasma-Lila.",                         rarity:"selten",   category:"animated", color1:"#7c3aed", color2:"#4f46e5", color3:"#8b5cf6",                   animation_type:"electric",   animation_speed:1.2, glow_color:"#7c3aed",  glow_radius:10, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  obsidian_shine:  { key:"obsidian_shine",  label:"Obsidian",           description:"Dunkler Obsidian mit Silber-Shimmer.",              rarity:"selten",   category:"animated", color1:"#52525b", color2:"#a1a1aa", color3:"#3f3f46",                   animation_type:"shimmer",    animation_speed:0.8, glow_color:"#71717a",  glow_radius:4,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },
  venom_green:     { key:"venom_green",     label:"Neon Venom",         description:"Hochgiftiges, pulsierendes Grün.",                  rarity:"selten",   category:"glow",     color1:"#16a34a",                                                       animation_type:"venom",      animation_speed:1,   glow_color:"#22c55e",  glow_radius:12, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:350000,   can_win_from_case:true,  is_special:false },

  // ══════════════════════════════ MYTHISCH ══════════════════════════════════════

  rainbow:         { key:"rainbow",         label:"Regenbogen",         description:"Voller Regenbogen-Cycle.",                          rarity:"mythisch", category:"animated", color1:"#ff0000", color2:"#00ff00", color3:"#0000ff",                   animation_type:"rainbow",    animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  lightning:       { key:"lightning",       label:"Blitz",              description:"Elektrisches Gelb-Weiß.",                           rarity:"mythisch", category:"animated", color1:"#fef08a", color2:"#ffffff", color3:"#fde047",                   animation_type:"flicker",    animation_speed:2,   glow_color:"#facc15",  glow_radius:12, prefix_icon:"⚡",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  galaxy:          { key:"galaxy",          label:"Galaxie",            description:"Tieflila-Blau wie der Weltraum.",                   rarity:"mythisch", category:"animated", color1:"#a855f7", color2:"#6366f1", color3:"#ec4899",                   animation_type:"shimmer",    animation_speed:1.5, glow_color:"#8b5cf6",  glow_radius:10, prefix_icon:"✦",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  lava:            { key:"lava",            label:"Lava",               description:"Brodelnde Lava — rot-orange Flow.",                  rarity:"mythisch", category:"animated", color1:"#ef4444", color2:"#f97316", color3:"#1c0000",                   animation_type:"wave",       animation_speed:0.8, glow_color:"#dc2626",  glow_radius:12, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  shadow:          { key:"shadow",          label:"Schatten",           description:"Dunkles Lila-Schwarz, mysteriös.",                  rarity:"mythisch", category:"glow",     color1:"#a78bfa", color2:"#1e0035",                                     animation_type:"pulse",      animation_speed:1.2, glow_color:"#7c3aed",  glow_radius:12, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  glitch:          { key:"glitch",          label:"Glitch",             description:"RGB-Glitch Effekt.",                                rarity:"mythisch", category:"special",  color1:"#ffffff", color2:"#ff0000", color3:"#00ffff",                   animation_type:"glitch",     animation_speed:2.5, glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  matrix:          { key:"matrix",          label:"Matrix",             description:"Terminal-Grün — Die Matrix hat dich.",              rarity:"mythisch", category:"special",  color1:"#00ff41", color2:"#003b00",                                     animation_type:"matrix",     animation_speed:1,   glow_color:"#00ff41",  glow_radius:14, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  royalty:         { key:"royalty",         label:"Royalty",            description:"Gold-Lila-Gradient mit Krone.",                     rarity:"mythisch", category:"animated", color1:"#f59e0b", color2:"#7c3aed", color3:"#fde68a",                   animation_type:"shimmer",    animation_speed:1.2, glow_color:"#f59e0b",  glow_radius:8,  prefix_icon:"♛",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  aurora_borealis: { key:"aurora_borealis", label:"Nordlicht",          description:"Fließendes Nordlicht — Grün, Blau, Lila.",          rarity:"mythisch", category:"animated", color1:"#10b981", color2:"#3b82f6", color3:"#a855f7", color4:"#06b6d4", animation_type:"aurora",     animation_speed:0.5, glow_color:"#10b981",  glow_radius:10, prefix_icon:"✦",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  cyberpunk:       { key:"cyberpunk",       label:"Cyberpunk",          description:"Neon-Pink/Cyan — Night City vibe.",                 rarity:"mythisch", category:"animated", color1:"#f0abfc", color2:"#22d3ee", color3:"#e879f9",                   animation_type:"cyber",      animation_speed:1.2, glow_color:"#e879f9",  glow_radius:12, prefix_icon:"◈",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  dragon_fire:     { key:"dragon_fire",     label:"Drachenfeuer",       description:"Infernales Drachenfeuer — rot-orange-gold.",         rarity:"mythisch", category:"animated", color1:"#dc2626", color2:"#f97316", color3:"#fbbf24", color4:"#7f1d1d", animation_type:"fire",       animation_speed:1.5, glow_color:"#ef4444",  glow_radius:14, prefix_icon:"🔥",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  phantom:         { key:"phantom",         label:"Phantom",            description:"Geisterhaftes Dunkel-Lila mit Glitch.",             rarity:"mythisch", category:"special",  color1:"#581c87", color2:"#a855f7", color3:"#e9d5ff",                   animation_type:"glitch",     animation_speed:1.5, glow_color:"#7c3aed",  glow_radius:10, prefix_icon:"👻",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  nebula:          { key:"nebula",          label:"Nebula",             description:"Tiefer Weltraum — violett-blau-pink.",              rarity:"mythisch", category:"animated", color1:"#6d28d9", color2:"#1d4ed8", color3:"#db2777", color4:"#0f0028", animation_type:"aurora",     animation_speed:0.6, glow_color:"#7c3aed",  glow_radius:12, prefix_icon:"✦",       suffix_icon:"✦",       unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  blood_moon_m:    { key:"blood_moon_m",    label:"Blutmond",           description:"Dunkler Vollmond aus Blut.",                        rarity:"mythisch", category:"glow",     color1:"#b91c1c",                                                       animation_type:"blood_moon", animation_speed:0.8, glow_color:"#dc2626",  glow_radius:14, prefix_icon:"🌑",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  electric_storm:  { key:"electric_storm",  label:"Elektro-Gewitter",   description:"Blitzendes Gelb-Weiß — Hochspannung.",              rarity:"mythisch", category:"animated", color1:"#fef08a", color2:"#ffffff", color3:"#fbbf24",                   animation_type:"electric",   animation_speed:2,   glow_color:"#fde047",  glow_radius:16, prefix_icon:"⚡",       suffix_icon:"⚡",       unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  frozen_hell:     { key:"frozen_hell",     label:"Eisige Hölle",       description:"Höllische Kälte — arktisches Eis-Weiß.",            rarity:"mythisch", category:"animated", color1:"#e0f2fe", color2:"#7dd3fc", color3:"#ffffff", color4:"#0284c7", animation_type:"fire",       animation_speed:0.9, glow_color:"#7dd3fc",  glow_radius:16, prefix_icon:"❄",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  venom_serpent:   { key:"venom_serpent",   label:"Giftschlange",       description:"Tödliches Schlangengift — dunkelgrün.",             rarity:"mythisch", category:"animated", color1:"#15803d", color2:"#052e16", color3:"#4ade80",                   animation_type:"venom",      animation_speed:1.2, glow_color:"#22c55e",  glow_radius:12, prefix_icon:"🐍",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  plague:          { key:"plague",          label:"Seuche",             description:"Ekelerregende Seuche — trübes Grün-Lila.",          rarity:"mythisch", category:"animated", color1:"#4d7c0f", color2:"#6d28d9", color3:"#84cc16",                   animation_type:"wave",       animation_speed:0.7, glow_color:"#65a30d",  glow_radius:10, prefix_icon:"☠",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  sakura_bloom:    { key:"sakura_bloom",    label:"Kirschblüte",        description:"Japanische Kirschblüte — zart, schön.",             rarity:"mythisch", category:"animated", color1:"#f9a8d4", color2:"#fce7f3", color3:"#ec4899", color4:"#fbcfe8", animation_type:"shimmer",    animation_speed:0.9, glow_color:"#f472b6",  glow_radius:8,  prefix_icon:"🌸",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  abyssal:         { key:"abyssal",         label:"Abyssal",            description:"Aus dem tiefsten Abgrund — dunkel-purpur.",         rarity:"mythisch", category:"glow",     color1:"#3b0764",                                                       animation_type:"pulse",      animation_speed:1.5, glow_color:"#6b21a8",  glow_radius:16, prefix_icon:"▼",       suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  neon_storm:      { key:"neon_storm",      label:"Neon Sturm",         description:"Chaotischer Neon-Sturm aus allen Farben.",          rarity:"mythisch", category:"animated", color1:"#ff0080", color2:"#00ffff", color3:"#ff6600", color4:"#ffff00", animation_type:"cyber",      animation_speed:2,   glow_color:"#ff0080",  glow_radius:12, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },
  inferno:         { key:"inferno",         label:"Inferno",            description:"Absolutes Flammeninferno — rot-orange.",            rarity:"mythisch", category:"animated", color1:"#ff1a00", color2:"#ff6b00", color3:"#ffd700", color4:"#7f0000", animation_type:"fire",       animation_speed:2,   glow_color:"#ef4444",  glow_radius:18, prefix_icon:"🔥",       suffix_icon:"🔥",       unlock_price_cr:2000000,  can_win_from_case:true,  is_special:false },

  // ══════════════════════════════ ULTRA ═════════════════════════════════════════

  prismatic:       { key:"prismatic",       label:"Prismatisch",        description:"Voller Spektrum-Farbverlauf, animiert.",            rarity:"ultra",    category:"animated", color1:"#ff0000", color2:"#00ff00", color3:"#0000ff",                   animation_type:"prismatic",  animation_speed:0.8, glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  celestial:       { key:"celestial",       label:"Celestial",          description:"Göttlich gold-weiß strahlend.",                     rarity:"ultra",    category:"animated", color1:"#fef9c3", color2:"#f59e0b", color3:"#ffffff",                   animation_type:"shimmer",    animation_speed:2,   glow_color:"#fef08a",  glow_radius:20, prefix_icon:"✦",       suffix_icon:"✦",       unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  void:            { key:"void",            label:"Void",               description:"Purpur-Schwarz — das Nichts selbst.",              rarity:"ultra",    category:"glow",     color1:"#9333ea",                                                       animation_type:"pulse",      animation_speed:1.8, glow_color:"#7c3aed",  glow_radius:20, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  hologram:        { key:"hologram",        label:"Hologramm",          description:"Transluzentes Cyan-Hologramm.",                     rarity:"ultra",    category:"animated", color1:"#67e8f9", color2:"#a5f3fc", color3:"#0891b2",                   animation_type:"hologram",   animation_speed:1,   glow_color:"#06b6d4",  glow_radius:18, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  obfuscated:      { key:"obfuscated",      label:"Obfuscated",         description:"Zufällig wechselnde Zeichen.",                      rarity:"ultra",    category:"special",  color1:"#00ff41",                                                       animation_type:"obfuscated", animation_speed:1,   glow_color:"#00ff41",  glow_radius:14, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  rgb_wave:        { key:"rgb_wave",        label:"RGB Wave",           description:"Jeder Buchstabe eigene RGB-Phase.",                 rarity:"ultra",    category:"special",  color1:"#ff0000", color2:"#00ff00", color3:"#0000ff",                   animation_type:"rgb_wave",   animation_speed:1.2, glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  godlike:         { key:"godlike",         label:"Göttlich",           description:"Transzendente göttliche Erscheinung — legendär.",    rarity:"ultra",    category:"animated", color1:"#fef9c3", color2:"#f59e0b", color3:"#ffffff", color4:"#fde047", animation_type:"divine",     animation_speed:1.5, glow_color:"#fef08a",  glow_radius:24, prefix_icon:"✦",       suffix_icon:"✦",       unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  demon_lord:      { key:"demon_lord",      label:"Dämonenfürst",       description:"Höllischer Dämonenfürst — schwarz-blutrot.",        rarity:"ultra",    category:"animated", color1:"#7f1d1d", color2:"#450a0a", color3:"#dc2626", color4:"#0a0000", animation_type:"blood_moon", animation_speed:1.2, glow_color:"#dc2626",  glow_radius:20, prefix_icon:"👿",       suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  quantum_flux:    { key:"quantum_flux",    label:"Quantenfluss",       description:"Cyan-Lila Quantenfluktuationen.",                   rarity:"ultra",    category:"animated", color1:"#22d3ee", color2:"#a855f7", color3:"#06b6d4", color4:"#7c3aed", animation_type:"hologram",   animation_speed:1.2, glow_color:"#22d3ee",  glow_radius:18, prefix_icon:"⚛",       suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  chaos_realm:     { key:"chaos_realm",     label:"Chaosreich",         description:"Pure Chaos-Energie — unkontrollierbare Farben.",    rarity:"ultra",    category:"animated", color1:"#ff0000", color2:"#ffff00", color3:"#00ff00", color4:"#0000ff", animation_type:"chaos",      animation_speed:2.5, glow_color:"#ff00ff",  glow_radius:16, prefix_icon:"💥",       suffix_icon:"💥",       unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  singularity:     { key:"singularity",     label:"Singularität",       description:"Schwarzes Loch — Gold am Ereignishorizont.",        rarity:"ultra",    category:"animated", color1:"#000000", color2:"#f59e0b", color3:"#fef08a", color4:"#0a0a0a", animation_type:"fire",       animation_speed:0.8, glow_color:"#f59e0b",  glow_radius:22, prefix_icon:"◉",       suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  supernova:       { key:"supernova",       label:"Supernova",          description:"Galaktische Explosion — blendend hell.",            rarity:"ultra",    category:"animated", color1:"#ffffff", color2:"#f59e0b", color3:"#ef4444", color4:"#a855f7", animation_type:"divine",     animation_speed:2,   glow_color:"#ffffff",  glow_radius:28, prefix_icon:"💫",       suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  dark_matter:     { key:"dark_matter",     label:"Dunkle Materie",     description:"Unsichtbare dunkle Materie — kosmisch.",            rarity:"ultra",    category:"animated", color1:"#1e1b4b", color2:"#312e81", color3:"#4c1d95", color4:"#000000", animation_type:"aurora",     animation_speed:0.4, glow_color:"#6d28d9",  glow_radius:20, prefix_icon:"◈",       suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  time_warp:       { key:"time_warp",       label:"Zeitverzerrung",     description:"Raumzeit-Verzerrung — blau-violett-weiß.",          rarity:"ultra",    category:"animated", color1:"#ddd6fe", color2:"#7c3aed", color3:"#06b6d4", color4:"#ffffff", animation_type:"cyber",      animation_speed:1.8, glow_color:"#a78bfa",  glow_radius:18, prefix_icon:"⌛",       suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  cosmic_horror:   { key:"cosmic_horror",   label:"Kosmischer Horror",  description:"Chtulu-Essenz — unheimlich, eldritch.",             rarity:"ultra",    category:"animated", color1:"#365314", color2:"#4c1d95", color3:"#052e16", color4:"#1e0035", animation_type:"venom",      animation_speed:1.5, glow_color:"#22c55e",  glow_radius:16, prefix_icon:"🌀",       suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  divine_flame:    { key:"divine_flame",    label:"Göttliche Flamme",   description:"Heiliges Feuer von oben — gold-weiß.",              rarity:"ultra",    category:"animated", color1:"#fef9c3", color2:"#fbbf24", color3:"#ffffff", color4:"#f59e0b", animation_type:"fire",       animation_speed:2.2, glow_color:"#fef08a",  glow_radius:24, prefix_icon:"✦",       suffix_icon:"✦",       unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  void_walker:     { key:"void_walker",     label:"Leerläufer",         description:"Wandert durch die Leere selbst.",                   rarity:"ultra",    category:"animated", color1:"#0f0015", color2:"#4c1d95", color3:"#7c3aed", color4:"#000000", animation_type:"pulse",      animation_speed:2,   glow_color:"#5b21b6",  glow_radius:22, prefix_icon:"▾",       suffix_icon:undefined, unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },
  ascended:        { key:"ascended",        label:"Aufgestiegen",       description:"Transzendenz erreicht — jenseits von Ultra.",       rarity:"ultra",    category:"animated", color1:"#ff0000", color2:"#ff9900", color3:"#ffffff", color4:"#9900ff", animation_type:"prismatic",  animation_speed:1.5, glow_color:"#ffffff",  glow_radius:30, prefix_icon:"★",       suffix_icon:"★",       unlock_price_cr:12000000, can_win_from_case:true,  is_special:false },

  // ══════════════════════════════ SPECIAL / ADMIN ════════════════════════════════

  warned:          { key:"warned",          label:"Verwarnt",           description:"Rote Warnung sichtbar für alle.",                   rarity:"selten",   category:"glow",     color1:"#ef4444",                                                       animation_type:"flicker",    animation_speed:0.6, glow_color:"#dc2626",  glow_radius:12, prefix_icon:"⚠",       suffix_icon:undefined, unlock_price_cr:0,        can_win_from_case:false, is_special:true },
  admin_style:     { key:"admin_style",     label:"Admin",              description:"Exklusiv für Admins.",                              rarity:"ultra",    category:"animated", color1:"#f59e0b", color2:"#ef4444", color3:"#fde68a",                   animation_type:"prismatic",  animation_speed:1.5, glow_color:"#f59e0b",  glow_radius:20, prefix_icon:"⚡",       suffix_icon:undefined, unlock_price_cr:0,        can_win_from_case:false, is_special:true },
  mod_style:       { key:"mod_style",       label:"Moderator",          description:"Exklusiv für Mods.",                                rarity:"mythisch", category:"glow",     color1:"#22c55e",                                                       animation_type:"pulse",      animation_speed:1.2, glow_color:"#16a34a",  glow_radius:14, prefix_icon:"🛡",       suffix_icon:undefined, unlock_price_cr:0,        can_win_from_case:false, is_special:true },
  developer:       { key:"developer",       label:"Entwickler",         description:"Exklusiv für Entwickler.",                          rarity:"ultra",    category:"special",  color1:"#22d3ee",                                                       animation_type:"electric",   animation_speed:2.5, glow_color:"#06b6d4",  glow_radius:20, prefix_icon:"</",      suffix_icon:">",       unlock_price_cr:0,        can_win_from_case:false, is_special:true },
  founder:         { key:"founder",         label:"Gründer",            description:"Exklusiv für Community-Gründer.",                   rarity:"ultra",    category:"animated", color1:"#fef9c3", color2:"#f59e0b", color3:"#fde047",                   animation_type:"divine",     animation_speed:1,   glow_color:"#f59e0b",  glow_radius:24, prefix_icon:"♛",       suffix_icon:undefined, unlock_price_cr:0,        can_win_from_case:false, is_special:true },
  staff_lead:      { key:"staff_lead",      label:"Staff Lead",         description:"Exklusiv für Staff-Leads.",                         rarity:"mythisch", category:"animated", color1:"#7dd3fc", color2:"#38bdf8", color3:"#bae6fd",                   animation_type:"shimmer",    animation_speed:1.4, glow_color:"#38bdf8",  glow_radius:14, prefix_icon:"★",       suffix_icon:undefined, unlock_price_cr:0,        can_win_from_case:false, is_special:true },
};

export const ALL_STYLE_KEYS = Object.keys(NAME_STYLES);

export const STYLES_BY_RARITY: Record<NameStyleRarity, NameStyleDef[]> = {
  normal:   ALL_STYLE_KEYS.map(k => NAME_STYLES[k]).filter(s => s.rarity === "normal"),
  selten:   ALL_STYLE_KEYS.map(k => NAME_STYLES[k]).filter(s => s.rarity === "selten"),
  mythisch: ALL_STYLE_KEYS.map(k => NAME_STYLES[k]).filter(s => s.rarity === "mythisch"),
  ultra:    ALL_STYLE_KEYS.map(k => NAME_STYLES[k]).filter(s => s.rarity === "ultra"),
};

export const NAME_STYLE_RARITY_PRICES: Record<NameStyleRarity, number> = {
  normal:   50_000,
  selten:   350_000,
  mythisch: 2_000_000,
  ultra:    12_000_000,
};

export interface NameStyleRarityConfig {
  rarity: NameStyleRarity;
  baseShopPriceCr: number;
  maxShopPriceCr: number;
  caseDropWeight: number;
  caseDropEnabled: boolean;
  bpRewardEnabled: boolean;
  canTrade: boolean;
  labelOverride: string | null;
  glowColorOverride: string | null;
  updatedAt: string;
}

export function getNameStyle(key: string | null | undefined): NameStyleDef {
  return NAME_STYLES[key ?? "default"] ?? NAME_STYLES["default"];
}
