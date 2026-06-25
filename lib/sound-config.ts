// ─── Sound Config — Types ──────────────────────────────────────────────────────

export type SoundEventKey =
  | "tick" | "hover" | "hit" | "click"
  | "win" | "ultraWin" | "error" | "flip" | "save"
  | "levelUp" | "xpGain" | "abilityEquip"
  | "questComplete"   | "bpTierClaim"     | "monsterKill"
  | "pvpHit"          | "pvpKill"         | "purchaseSuccess"
  | "purchaseFail"    | "streakClaim"     | "notificationPing"
  | "caseOpen"        | "caseReveal"      | "achievementUnlock"
  | "messageReceive"  | "shopPurchase"    | "upgradeSuccess";

export interface SoundEventConfig {
  file: string;
  volume: number;
  enabled: boolean;
}

export type SoundConfig = Record<SoundEventKey, SoundEventConfig>;

export interface SoundEventMeta {
  key: SoundEventKey;
  label: string;
  group: string;
  defaultFile: string;
  defaultVolume: number;
}

export const SOUND_EVENT_META: SoundEventMeta[] = [
  // ── Reel / tick sounds ──
  { key: "tick",         label: "Reel-Tick",          group: "Reel",   defaultFile: "/sounds/tick.wav",      defaultVolume: 0.18 },
  { key: "hover",        label: "Hover",               group: "UI",     defaultFile: "/sounds/hover.wav",     defaultVolume: 0.10 },
  { key: "hit",          label: "Treffer (Welt)",      group: "Welt",   defaultFile: "/sounds/hit.wav",       defaultVolume: 0.28 },
  { key: "click",        label: "Click",               group: "UI",     defaultFile: "/sounds/click.wav",     defaultVolume: 0.18 },
  { key: "win",          label: "Gewinn",              group: "Spiele", defaultFile: "/sounds/win.wav",       defaultVolume: 0.35 },
  { key: "ultraWin",     label: "Ultra-Gewinn",        group: "Spiele", defaultFile: "/sounds/ultra-win.wav", defaultVolume: 0.35 },
  { key: "error",        label: "Fehler",              group: "UI",     defaultFile: "/sounds/error.wav",     defaultVolume: 0.35 },
  { key: "flip",         label: "Flip (DON/Cases)",    group: "Spiele", defaultFile: "/sounds/flip.wav",      defaultVolume: 0.35 },
  { key: "save",         label: "Speichern",           group: "UI",     defaultFile: "/sounds/save.wav",      defaultVolume: 0.20 },
  // ── New events ──
  { key: "levelUp",      label: "Level-Up",            group: "Level",  defaultFile: "/sounds/win.wav",       defaultVolume: 0.40 },
  { key: "xpGain",       label: "XP-Gewinn",           group: "Level",  defaultFile: "/sounds/tick.wav",      defaultVolume: 0.15 },
  { key: "abilityEquip", label: "Fähigkeit ausrüsten", group: "Level",  defaultFile: "/sounds/save.wav",      defaultVolume: 0.25 },
  // ── Extended events ──
  { key: "questComplete",    label: "Quest abgeschlossen",        group: "Battle Pass", defaultFile: "/sounds/win.wav",       defaultVolume: 0.38 },
  { key: "bpTierClaim",      label: "BP Tier eingelöst",          group: "Battle Pass", defaultFile: "/sounds/save.wav",      defaultVolume: 0.32 },
  { key: "monsterKill",      label: "Monster getötet",            group: "Welt",        defaultFile: "/sounds/hit.wav",       defaultVolume: 0.22 },
  { key: "pvpHit",           label: "PvP Treffer (eingehend)",   group: "Welt",        defaultFile: "/sounds/hit.wav",       defaultVolume: 0.30 },
  { key: "pvpKill",          label: "PvP Kill",                   group: "Welt",        defaultFile: "/sounds/win.wav",       defaultVolume: 0.35 },
  { key: "purchaseSuccess",  label: "Kauf erfolgreich",           group: "Shop",        defaultFile: "/sounds/save.wav",      defaultVolume: 0.28 },
  { key: "purchaseFail",     label: "Kauf fehlgeschlagen",        group: "Shop",        defaultFile: "/sounds/error.wav",     defaultVolume: 0.30 },
  { key: "streakClaim",      label: "Daily-Reward eingelöst",     group: "Spiele",      defaultFile: "/sounds/win.wav",       defaultVolume: 0.38 },
  { key: "notificationPing", label: "Neue Benachrichtigung",      group: "UI",          defaultFile: "/sounds/tick.wav",      defaultVolume: 0.18 },
  { key: "caseOpen",         label: "Case öffnen (Start)",        group: "Spiele",      defaultFile: "/sounds/flip.wav",      defaultVolume: 0.25 },
  { key: "caseReveal",       label: "Case Ergebnis enthüllt",     group: "Spiele",      defaultFile: "/sounds/ultra-win.wav", defaultVolume: 0.40 },
  { key: "achievementUnlock",label: "Achievement freigeschaltet", group: "Level",       defaultFile: "/sounds/win.wav",       defaultVolume: 0.42 },
  { key: "messageReceive",   label: "Neue Chat-Nachricht",        group: "Chat",        defaultFile: "/sounds/hover.wav",     defaultVolume: 0.12 },
  { key: "shopPurchase",     label: "Shop-Kauf",                  group: "Shop",        defaultFile: "/sounds/save.wav",      defaultVolume: 0.28 },
  { key: "upgradeSuccess",   label: "Upgrade erfolgreich",        group: "Level",       defaultFile: "/sounds/win.wav",       defaultVolume: 0.35 },
];

/** All sound files the admin can choose from. */
export const AVAILABLE_SOUND_FILES: { file: string; label: string }[] = [
  { file: "/sounds/tick.wav",          label: "Tick" },
  { file: "/sounds/hover.wav",         label: "Hover" },
  { file: "/sounds/hit.wav",           label: "Hit" },
  { file: "/sounds/click.wav",         label: "Click" },
  { file: "/sounds/win.wav",           label: "Win" },
  { file: "/sounds/ultra-win.wav",     label: "Ultra-Win" },
  { file: "/sounds/error.wav",         label: "Error" },
  { file: "/sounds/flip.wav",          label: "Flip" },
  { file: "/sounds/save.wav",          label: "Save" },
  { file: "/sounds/coin.wav",          label: "Münze" },
  { file: "/sounds/ding.wav",          label: "Ding" },
  { file: "/sounds/swoosh.wav",        label: "Swoosh" },
  { file: "/sounds/pop.wav",           label: "Pop" },
  { file: "/sounds/chime.wav",         label: "Chime (hell)" },
  { file: "/sounds/chime-low.wav",     label: "Chime (tief)" },
  { file: "/sounds/boom.wav",          label: "Boom" },
  { file: "/sounds/zap.wav",           label: "Zap" },
  { file: "/sounds/powerup.wav",       label: "Power-Up" },
  { file: "/sounds/select.wav",        label: "Auswählen" },
  { file: "/sounds/notification.wav",  label: "Benachrichtigung" },
  { file: "/sounds/achievement.wav",   label: "Achievement" },
  { file: "/sounds/levelup-epic.wav",  label: "Level-Up (episch)" },
  { file: "/sounds/fanfare.wav",       label: "Fanfare" },
  { file: "/sounds/whoosh.wav",        label: "Whoosh" },
  { file: "/sounds/glitch.wav",        label: "Glitch" },
  { file: "/sounds/laser.wav",         label: "Laser" },
  { file: "/sounds/punch.wav",         label: "Schlag" },
  { file: "/sounds/shield-block.wav",  label: "Schild blockiert" },
  { file: "/sounds/sword-swing.wav",   label: "Schwertschwung" },
  { file: "/sounds/coin-collect.wav",  label: "Münzen einsammeln" },
  { file: "/sounds/ui-open.wav",       label: "UI öffnen" },
  { file: "/sounds/ui-close.wav",      label: "UI schließen" },
  { file: "/sounds/success-soft.wav",  label: "Erfolg (sanft)" },
  { file: "/sounds/success-hard.wav",  label: "Erfolg (stark)" },
  { file: "/sounds/none",              label: "— Kein Ton —" },
];

export const DEFAULT_SOUND_CONFIG: SoundConfig = Object.fromEntries(
  SOUND_EVENT_META.map((m) => [
    m.key,
    { file: m.defaultFile, volume: m.defaultVolume, enabled: true },
  ])
) as SoundConfig;
