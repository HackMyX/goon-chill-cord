import type { CSSProperties } from "react";

export type NameStyleRarity = "normal" | "selten" | "mythisch" | "ultra";
export type AnimationType =
  | "none" | "shimmer" | "pulse" | "wave" | "rainbow" | "prismatic"
  | "flicker" | "glitch" | "matrix" | "hologram" | "obfuscated" | "rgb_wave";

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
  none:       "",
  shimmer:    "ns-shimmer",
  pulse:      "ns-pulse",
  wave:       "ns-wave",
  rainbow:    "ns-rainbow",
  prismatic:  "ns-prismatic",
  flicker:    "ns-flicker",
  glitch:     "ns-glitch",
  matrix:     "ns-matrix",
  hologram:   "ns-hologram",
  obfuscated: "ns-obfuscated",
  rgb_wave:   "",            // handled in JS (per-character)
};

/** Compute inline CSSProperties for a NameStyleDef */
export function computeNameStyleCSS(style: NameStyleDef): CSSProperties {
  const isGradient = Boolean(style.color2);
  const speed = 2 / (style.animation_speed || 1);

  if (style.animation_type === "matrix") {
    return {
      color: "#00ff41",
      textShadow: `0 0 8px #00ff41, 0 0 20px #00ff41, 0 0 40px #003b00`,
      fontFamily: "monospace",
      animationDuration: `${speed}s`,
    };
  }

  if (style.animation_type === "glitch") {
    return {
      color: "#ffffff",
      animationDuration: `${speed * 0.3}s`,
    };
  }

  if (style.animation_type === "hologram") {
    const colors = [style.color1, style.color2, style.color3].filter(Boolean).join(", ");
    return {
      backgroundImage: isGradient
        ? `linear-gradient(90deg, ${colors}, ${style.color1})`
        : undefined,
      backgroundSize: "200% auto",
      backgroundClip: isGradient ? "text" : undefined,
      WebkitBackgroundClip: isGradient ? "text" : undefined,
      WebkitTextFillColor: isGradient ? "transparent" : undefined,
      color: isGradient ? "transparent" : style.color1,
      opacity: 0.9,
      animationDuration: `${speed * 1.5}s`,
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

  // Solid/glow
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
  default:     { key:"default",     label:"Standard",      description:"Schlichtes weiß.",                        rarity:"normal",   category:"solid",    color1:"#f4f4f5",                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:0,     can_win_from_case:false, is_special:false },
  warm_white:  { key:"warm_white",  label:"Warmes Weiß",   description:"Warmes, cremiges Weiß.",                  rarity:"normal",   category:"solid",    color1:"#fef3c7",                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:500,   can_win_from_case:true,  is_special:false },
  sky:         { key:"sky",         label:"Himmelblau",    description:"Beruhigendes Himmelblau.",                rarity:"normal",   category:"solid",    color1:"#7dd3fc",                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:500,   can_win_from_case:true,  is_special:false },
  mint:        { key:"mint",        label:"Mintgrün",      description:"Frisches Mint.",                          rarity:"normal",   category:"solid",    color1:"#6ee7b7",                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:500,   can_win_from_case:true,  is_special:false },
  rose:        { key:"rose",        label:"Rose",          description:"Zart-rosiges Pink.",                      rarity:"normal",   category:"solid",    color1:"#fda4af",                                       animation_type:"none",       animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:500,   can_win_from_case:true,  is_special:false },

  fire:        { key:"fire",        label:"Feuerrot",      description:"Lodernd wie Flammen.",                    rarity:"selten",   category:"animated", color1:"#ff6b00", color2:"#ff0000", color3:"#ffaa00",   animation_type:"shimmer",    animation_speed:1.2, glow_color:"#ff4400",  glow_radius:8,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:3000,  can_win_from_case:true,  is_special:false },
  ice:         { key:"ice",         label:"Eisblau",       description:"Glitzernd wie Eis.",                      rarity:"selten",   category:"animated", color1:"#bfdbfe", color2:"#60a5fa", color3:"#e0f2fe",   animation_type:"shimmer",    animation_speed:0.8, glow_color:"#3b82f6",  glow_radius:6,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:3000,  can_win_from_case:true,  is_special:false },
  toxic:       { key:"toxic",       label:"Giftgrün",      description:"Giftig leuchtend.",                       rarity:"selten",   category:"glow",     color1:"#4ade80",                                       animation_type:"pulse",      animation_speed:1,   glow_color:"#22c55e",  glow_radius:10, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:3000,  can_win_from_case:true,  is_special:false },
  gold_shine:  { key:"gold_shine",  label:"Goldglanz",     description:"Schimmerndes Gold.",                      rarity:"selten",   category:"animated", color1:"#fbbf24", color2:"#f59e0b", color3:"#fde68a",   animation_type:"shimmer",    animation_speed:1.5, glow_color:"#f59e0b",  glow_radius:6,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:3500,  can_win_from_case:true,  is_special:false },
  neon_pink:   { key:"neon_pink",   label:"Neon Pink",     description:"Knalliges Neon-Pink.",                    rarity:"selten",   category:"glow",     color1:"#f472b6",                                       animation_type:"pulse",      animation_speed:1.2, glow_color:"#ec4899",  glow_radius:10, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:3500,  can_win_from_case:true,  is_special:false },
  neon_cyan:   { key:"neon_cyan",   label:"Neon Cyan",     description:"Elektrisches Cyan-Leuchten.",             rarity:"selten",   category:"glow",     color1:"#22d3ee",                                       animation_type:"pulse",      animation_speed:1.2, glow_color:"#06b6d4",  glow_radius:10, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:3500,  can_win_from_case:true,  is_special:false },
  blood:       { key:"blood",       label:"Blutrot",       description:"Tiefes Karmesinrot, bedrohlich.",         rarity:"selten",   category:"glow",     color1:"#dc2626",                                       animation_type:"pulse",      animation_speed:0.8, glow_color:"#991b1b",  glow_radius:8,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:3500,  can_win_from_case:true,  is_special:false },
  poison:      { key:"poison",      label:"Gift",          description:"Giftsäure-Grün, zischend.",               rarity:"selten",   category:"animated", color1:"#84cc16", color2:"#365314",                     animation_type:"wave",       animation_speed:0.8, glow_color:"#65a30d",  glow_radius:8,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:3500,  can_win_from_case:true,  is_special:false },

  rainbow:     { key:"rainbow",     label:"Regenbogen",    description:"Voller Regenbogen-Cycle.",                rarity:"mythisch", category:"animated", color1:"#ff0000", color2:"#00ff00", color3:"#0000ff",   animation_type:"rainbow",    animation_speed:1,   glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:12000, can_win_from_case:true,  is_special:false },
  lightning:   { key:"lightning",   label:"Blitz",         description:"Elektrisches Gelb-Weiß.",                 rarity:"mythisch", category:"animated", color1:"#fef08a", color2:"#ffffff", color3:"#fde047",   animation_type:"flicker",    animation_speed:2,   glow_color:"#facc15",  glow_radius:12, prefix_icon:"⚡",       suffix_icon:undefined, unlock_price_cr:12000, can_win_from_case:true,  is_special:false },
  galaxy:      { key:"galaxy",      label:"Galaxie",       description:"Tieflila-Blau wie der Weltraum.",         rarity:"mythisch", category:"animated", color1:"#a855f7", color2:"#6366f1", color3:"#ec4899",   animation_type:"shimmer",    animation_speed:1.5, glow_color:"#8b5cf6",  glow_radius:10, prefix_icon:"✦",       suffix_icon:undefined, unlock_price_cr:14000, can_win_from_case:true,  is_special:false },
  lava:        { key:"lava",        label:"Lava",          description:"Brodelnde Lava — rot-orange Flow.",        rarity:"mythisch", category:"animated", color1:"#ef4444", color2:"#f97316", color3:"#1c0000",   animation_type:"wave",       animation_speed:0.8, glow_color:"#dc2626",  glow_radius:12, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:14000, can_win_from_case:true,  is_special:false },
  shadow:      { key:"shadow",      label:"Schatten",      description:"Dunkles Lila-Schwarz, mysteriös.",        rarity:"mythisch", category:"glow",     color1:"#a78bfa", color2:"#1e0035",                     animation_type:"pulse",      animation_speed:1.2, glow_color:"#7c3aed",  glow_radius:12, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:14000, can_win_from_case:true,  is_special:false },
  glitch:      { key:"glitch",      label:"Glitch",        description:"RGB-Glitch Effekt.",                      rarity:"mythisch", category:"special",  color1:"#ffffff", color2:"#ff0000", color3:"#00ffff",   animation_type:"glitch",     animation_speed:2.5, glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:16000, can_win_from_case:true,  is_special:false },
  matrix:      { key:"matrix",      label:"Matrix",        description:"Terminal-Grün — Die Matrix hat dich.",    rarity:"mythisch", category:"special",  color1:"#00ff41", color2:"#003b00",                     animation_type:"matrix",     animation_speed:1,   glow_color:"#00ff41",  glow_radius:14, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:16000, can_win_from_case:true,  is_special:false },
  royalty:     { key:"royalty",     label:"Royalty",       description:"Gold-Lila-Gradient mit Krone.",           rarity:"mythisch", category:"animated", color1:"#f59e0b", color2:"#7c3aed", color3:"#fde68a",   animation_type:"shimmer",    animation_speed:1.2, glow_color:"#f59e0b",  glow_radius:8,  prefix_icon:"♛",       suffix_icon:undefined, unlock_price_cr:18000, can_win_from_case:true,  is_special:false },

  prismatic:   { key:"prismatic",   label:"Prismatisch",   description:"Voller Spektrum-Farbverlauf, animiert.",  rarity:"ultra",    category:"animated", color1:"#ff0000", color2:"#00ff00", color3:"#0000ff",   animation_type:"prismatic",  animation_speed:0.8, glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:50000, can_win_from_case:true,  is_special:false },
  celestial:   { key:"celestial",   label:"Celestial",     description:"Göttlich gold-weiß strahlend.",          rarity:"ultra",    category:"animated", color1:"#fef9c3", color2:"#f59e0b", color3:"#ffffff",   animation_type:"shimmer",    animation_speed:2,   glow_color:"#fef08a",  glow_radius:20, prefix_icon:"✦",       suffix_icon:"✦",       unlock_price_cr:50000, can_win_from_case:true,  is_special:false },
  void:        { key:"void",        label:"Void",          description:"Purpur-Schwarz — das Nichts selbst.",    rarity:"ultra",    category:"glow",     color1:"#9333ea", color2:"#4c1d95",                     animation_type:"pulse",      animation_speed:1.8, glow_color:"#7c3aed",  glow_radius:20, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:60000, can_win_from_case:true,  is_special:false },
  hologram:    { key:"hologram",    label:"Hologramm",     description:"Transluzentes Cyan-Hologramm.",          rarity:"ultra",    category:"animated", color1:"#67e8f9", color2:"#a5f3fc", color3:"#0891b2",   animation_type:"hologram",   animation_speed:1,   glow_color:"#06b6d4",  glow_radius:18, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:60000, can_win_from_case:true,  is_special:false },
  obfuscated:  { key:"obfuscated",  label:"Obfuscated",    description:"Zufällig wechselnde Zeichen.",           rarity:"ultra",    category:"special",  color1:"#00ff41",                                       animation_type:"obfuscated", animation_speed:1,   glow_color:"#00ff41",  glow_radius:14, prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:80000, can_win_from_case:true,  is_special:false },
  rgb_wave:    { key:"rgb_wave",    label:"RGB Wave",      description:"Jeder Buchstabe eigene RGB-Phase.",      rarity:"ultra",    category:"special",  color1:"#ff0000", color2:"#00ff00", color3:"#0000ff",   animation_type:"rgb_wave",   animation_speed:1.2, glow_color:undefined,  glow_radius:0,  prefix_icon:undefined, suffix_icon:undefined, unlock_price_cr:80000, can_win_from_case:true,  is_special:false },

  // Special / Admin-assigned
  warned:      { key:"warned",      label:"Verwarnt",      description:"Rote Warnung sichtbar für alle.",        rarity:"selten",   category:"glow",     color1:"#ef4444",                                       animation_type:"flicker",    animation_speed:0.6, glow_color:"#dc2626",  glow_radius:12, prefix_icon:"⚠",       suffix_icon:undefined, unlock_price_cr:0,     can_win_from_case:false, is_special:true },
  admin_style: { key:"admin_style", label:"Admin",         description:"Exklusiv für Admins.",                   rarity:"ultra",    category:"animated", color1:"#f59e0b", color2:"#ef4444", color3:"#fde68a",   animation_type:"prismatic",  animation_speed:1.5, glow_color:"#f59e0b",  glow_radius:20, prefix_icon:"⚡",       suffix_icon:undefined, unlock_price_cr:0,     can_win_from_case:false, is_special:true },
  mod_style:   { key:"mod_style",   label:"Moderator",     description:"Exklusiv für Mods.",                     rarity:"mythisch", category:"glow",     color1:"#22c55e",                                       animation_type:"pulse",      animation_speed:1.2, glow_color:"#16a34a",  glow_radius:14, prefix_icon:"🛡",       suffix_icon:undefined, unlock_price_cr:0,     can_win_from_case:false, is_special:true },
};

export const ALL_STYLE_KEYS = Object.keys(NAME_STYLES);

export const STYLES_BY_RARITY: Record<NameStyleRarity, NameStyleDef[]> = {
  normal:   ALL_STYLE_KEYS.map(k => NAME_STYLES[k]).filter(s => s.rarity === "normal"),
  selten:   ALL_STYLE_KEYS.map(k => NAME_STYLES[k]).filter(s => s.rarity === "selten"),
  mythisch: ALL_STYLE_KEYS.map(k => NAME_STYLES[k]).filter(s => s.rarity === "mythisch"),
  ultra:    ALL_STYLE_KEYS.map(k => NAME_STYLES[k]).filter(s => s.rarity === "ultra"),
};

export function getNameStyle(key: string | null | undefined): NameStyleDef {
  return NAME_STYLES[key ?? "default"] ?? NAME_STYLES["default"];
}
