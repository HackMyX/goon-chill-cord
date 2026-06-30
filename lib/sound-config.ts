// ─── Sound Config — Types ──────────────────────────────────────────────────────

export type SoundEventKey =
  // ── Interrupt channels (special — always instant, never queued) ──
  | "tick" | "hover" | "hit"
  // ── UI ──
  | "click" | "error" | "save" | "notificationPing"
  | "modalOpen" | "modalClose" | "tabSwitch" | "toggleOn" | "toggleOff"
  | "adminSave" | "formError" | "confirmDialog" | "alertShow" | "selectItem"
  // ── Games / Reel ──
  | "win" | "ultraWin" | "flip" | "streakClaim"
  | "caseOpen" | "caseReveal"
  | "plinkoLand" | "snakeEat" | "snakeDie" | "donFlip"
  // ── Level & XP ──
  | "levelUp" | "xpGain" | "abilityEquip" | "achievementUnlock"
  | "questComplete" | "bpTierClaim" | "bpUnlock" | "bpEliteUnlock"
  | "rankUp" | "questStart"
  // ── Shop & Economy ──
  | "purchaseSuccess" | "purchaseFail" | "shopPurchase" | "upgradeSuccess"
  | "itemEquip" | "itemUnequip" | "auctionBid" | "auctionWin"
  | "shopOpen" | "itemDrop"
  // ── World / Combat ──
  | "monsterKill" | "pvpHit" | "pvpKill"
  | "playerDeath" | "playerRespawn" | "mineCollect" | "shieldBlock" | "playerHurt" | "monsterAttack" | "itemPickup"
  | "critHit" | "healReceived" | "battleStart"
  // ── Chat ──
  | "messageReceive" | "messageSend" | "mentionReceive" | "chatPing"
  | "warningAlert" | "dailyLogin"
  // ── System ──
  | "ticketOpen" | "badgeEarned"
  | "notification" | "unlockNew";

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
  // ── Interrupt / Reel ──────────────────────────────────────────────────────
  { key: "tick",            label: "Reel-Tick",                    group: "Reel",        defaultFile: "/sounds/tick.wav",      defaultVolume: 0.18 },
  { key: "hover",           label: "Hover",                        group: "UI",          defaultFile: "/sounds/hover.wav",     defaultVolume: 0.10 },
  { key: "hit",             label: "Treffer (Welt)",               group: "Welt",        defaultFile: "/sounds/hit.wav",       defaultVolume: 0.28 },

  // ── UI ───────────────────────────────────────────────────────────────────
  { key: "click",           label: "Click",                        group: "UI",          defaultFile: "/sounds/click.wav",     defaultVolume: 0.18 },
  { key: "error",           label: "Fehler",                       group: "UI",          defaultFile: "/sounds/error.wav",     defaultVolume: 0.35 },
  { key: "save",            label: "Speichern",                    group: "UI",          defaultFile: "/sounds/save.wav",      defaultVolume: 0.20 },
  { key: "notificationPing",label: "Neue Benachrichtigung",        group: "UI",          defaultFile: "/sounds/tick.wav",      defaultVolume: 0.18 },
  { key: "modalOpen",       label: "Modal öffnen",                 group: "UI",          defaultFile: "/sounds/click.wav",     defaultVolume: 0.12 },
  { key: "modalClose",      label: "Modal schließen",              group: "UI",          defaultFile: "/sounds/click.wav",     defaultVolume: 0.10 },
  { key: "tabSwitch",       label: "Tab wechseln",                 group: "UI",          defaultFile: "/sounds/hover.wav",     defaultVolume: 0.12 },
  { key: "toggleOn",        label: "Toggle aktivieren",            group: "UI",          defaultFile: "/sounds/save.wav",      defaultVolume: 0.14 },
  { key: "toggleOff",       label: "Toggle deaktivieren",          group: "UI",          defaultFile: "/sounds/hover.wav",     defaultVolume: 0.10 },

  // ── Spiele ───────────────────────────────────────────────────────────────
  { key: "win",             label: "Gewinn",                       group: "Spiele",      defaultFile: "/sounds/win.wav",       defaultVolume: 0.35 },
  { key: "ultraWin",        label: "Ultra-Gewinn",                 group: "Spiele",      defaultFile: "/sounds/ultra-win.wav", defaultVolume: 0.35 },
  { key: "flip",            label: "Flip (DON / Cases)",           group: "Spiele",      defaultFile: "/sounds/flip.wav",      defaultVolume: 0.35 },
  { key: "streakClaim",     label: "Daily-Reward eingelöst",       group: "Spiele",      defaultFile: "/sounds/win.wav",       defaultVolume: 0.38 },
  { key: "caseOpen",        label: "Case öffnen (Start)",          group: "Spiele",      defaultFile: "/sounds/flip.wav",      defaultVolume: 0.25 },
  { key: "caseReveal",      label: "Case Ergebnis enthüllt",       group: "Spiele",      defaultFile: "/sounds/ultra-win.wav", defaultVolume: 0.40 },
  { key: "plinkoLand",      label: "Plinko — Ball trifft",        group: "Spiele",      defaultFile: "/sounds/hit.wav",       defaultVolume: 0.22 },
  { key: "snakeEat",        label: "Snake — Futter fressen",      group: "Spiele",      defaultFile: "/sounds/tick.wav",      defaultVolume: 0.20 },
  { key: "snakeDie",        label: "Snake — Gestorben",           group: "Spiele",      defaultFile: "/sounds/error.wav",     defaultVolume: 0.28 },
  { key: "donFlip",         label: "DON — Münzwurf",              group: "Spiele",      defaultFile: "/sounds/flip.wav",      defaultVolume: 0.32 },

  // ── Level & XP ───────────────────────────────────────────────────────────
  { key: "levelUp",         label: "Level-Up",                     group: "Level & XP",  defaultFile: "/sounds/win.wav",       defaultVolume: 0.40 },
  { key: "xpGain",          label: "XP-Gewinn",                    group: "Level & XP",  defaultFile: "/sounds/tick.wav",      defaultVolume: 0.15 },
  { key: "abilityEquip",    label: "Fähigkeit ausrüsten",          group: "Level & XP",  defaultFile: "/sounds/save.wav",      defaultVolume: 0.25 },
  { key: "achievementUnlock",label: "Achievement freigeschaltet",  group: "Level & XP",  defaultFile: "/sounds/win.wav",       defaultVolume: 0.42 },
  { key: "questComplete",   label: "Quest abgeschlossen",          group: "Battle Pass", defaultFile: "/sounds/win.wav",       defaultVolume: 0.38 },
  { key: "bpTierClaim",     label: "BP-Tier eingelöst",            group: "Battle Pass", defaultFile: "/sounds/save.wav",      defaultVolume: 0.32 },
  { key: "bpUnlock",        label: "Battle Pass aktiviert",        group: "Battle Pass", defaultFile: "/sounds/ultra-win.wav", defaultVolume: 0.38 },
  { key: "bpEliteUnlock",   label: "Elite Pass aktiviert",         group: "Battle Pass", defaultFile: "/sounds/ultra-win.wav", defaultVolume: 0.42 },

  // ── Shop & Economy ───────────────────────────────────────────────────────
  { key: "purchaseSuccess", label: "Kauf erfolgreich",             group: "Shop",        defaultFile: "/sounds/save.wav",      defaultVolume: 0.28 },
  { key: "purchaseFail",    label: "Kauf fehlgeschlagen",          group: "Shop",        defaultFile: "/sounds/error.wav",     defaultVolume: 0.30 },
  { key: "shopPurchase",    label: "Shop-Kauf (allgemein)",        group: "Shop",        defaultFile: "/sounds/save.wav",      defaultVolume: 0.28 },
  { key: "upgradeSuccess",  label: "Upgrade erfolgreich",          group: "Shop",        defaultFile: "/sounds/win.wav",       defaultVolume: 0.35 },
  { key: "itemEquip",       label: "Item ausrüsten",               group: "Shop",        defaultFile: "/sounds/save.wav",      defaultVolume: 0.25 },
  { key: "itemUnequip",     label: "Item ablegen",                 group: "Shop",        defaultFile: "/sounds/hover.wav",     defaultVolume: 0.15 },
  { key: "auctionBid",      label: "Gebot abgeben",                group: "Shop",        defaultFile: "/sounds/flip.wav",      defaultVolume: 0.28 },
  { key: "auctionWin",      label: "Auktion gewonnen",             group: "Shop",        defaultFile: "/sounds/win.wav",       defaultVolume: 0.40 },

  // ── Welt / Combat ────────────────────────────────────────────────────────
  { key: "monsterKill",     label: "Monster getötet",              group: "Welt",        defaultFile: "/sounds/hit.wav",       defaultVolume: 0.22 },
  { key: "pvpHit",          label: "PvP Treffer (eingehend)",     group: "Welt",        defaultFile: "/sounds/hit.wav",       defaultVolume: 0.30 },
  { key: "pvpKill",         label: "PvP Kill",                     group: "Welt",        defaultFile: "/sounds/win.wav",       defaultVolume: 0.35 },
  { key: "playerDeath",     label: "Spieler gestorben",            group: "Welt",        defaultFile: "/sounds/error.wav",     defaultVolume: 0.35 },
  { key: "playerRespawn",   label: "Spieler respawnt",             group: "Welt",        defaultFile: "/sounds/save.wav",      defaultVolume: 0.22 },
  { key: "mineCollect",     label: "Mine einsammeln",              group: "Welt",        defaultFile: "/sounds/tick.wav",      defaultVolume: 0.18 },
  { key: "shieldBlock",     label: "Schild getroffen / blockiert", group: "Welt",        defaultFile: "/sounds/shield-block.wav", defaultVolume: 0.32 },
  { key: "playerHurt",      label: "Spieler getroffen (HP)",       group: "Welt",        defaultFile: "/sounds/punch.wav",     defaultVolume: 0.3 },
  { key: "monsterAttack",   label: "Monster-Angriff (Swoosh)",     group: "Welt",        defaultFile: "/sounds/swoosh.wav",    defaultVolume: 0.2 },
  { key: "itemPickup",      label: "Item aufgehoben",              group: "Welt",        defaultFile: "/sounds/save.wav",      defaultVolume: 0.20 },

  // ── Chat ─────────────────────────────────────────────────────────────────
  { key: "messageReceive",  label: "Neue Chat-Nachricht",          group: "Chat",        defaultFile: "/sounds/hover.wav",     defaultVolume: 0.12 },
  { key: "messageSend",     label: "Nachricht gesendet",           group: "Chat",        defaultFile: "/sounds/click.wav",     defaultVolume: 0.15 },
  { key: "mentionReceive",  label: "@Erwähnung empfangen",         group: "Chat",        defaultFile: "/sounds/win.wav",       defaultVolume: 0.30 },
  { key: "chatPing",        label: "Chat Ping",                    group: "Chat",        defaultFile: "/sounds/hover.wav",     defaultVolume: 0.20 },

  // ── System ───────────────────────────────────────────────────────────────
  { key: "ticketOpen",      label: "Ticket erstellt",              group: "System",      defaultFile: "/sounds/save.wav",      defaultVolume: 0.18 },
  { key: "badgeEarned",     label: "Badge verdient",               group: "System",      defaultFile: "/sounds/win.wav",       defaultVolume: 0.38 },
  { key: "notification",    label: "Benachrichtigung (allgemein)", group: "System",      defaultFile: "/sounds/notification.wav", defaultVolume: 0.22 },
  { key: "unlockNew",       label: "Neu freigeschaltet",           group: "System",      defaultFile: "/sounds/unlock.wav",    defaultVolume: 0.28 },

  // ── UI (Erweitert) ────────────────────────────────────────────────────────
  { key: "adminSave",       label: "Admin-Einstellung gespeichert",group: "UI",          defaultFile: "/sounds/success-soft.wav", defaultVolume: 0.22 },
  { key: "formError",       label: "Formular-Fehler",              group: "UI",          defaultFile: "/sounds/error.wav",     defaultVolume: 0.28 },
  { key: "confirmDialog",   label: "Bestätigungs-Dialog",          group: "UI",          defaultFile: "/sounds/blip.wav",      defaultVolume: 0.14 },
  { key: "alertShow",       label: "Alert / Toast angezeigt",      group: "UI",          defaultFile: "/sounds/notification.wav", defaultVolume: 0.18 },
  { key: "selectItem",      label: "Item ausgewählt",              group: "UI",          defaultFile: "/sounds/select.wav",    defaultVolume: 0.14 },
  { key: "shopOpen",        label: "Shop geöffnet",                group: "Shop",        defaultFile: "/sounds/ui-open.wav",   defaultVolume: 0.18 },
  { key: "itemDrop",        label: "Item fallen lassen",           group: "Welt",        defaultFile: "/sounds/drop.wav",      defaultVolume: 0.22 },
  { key: "critHit",         label: "Kritischer Treffer",           group: "Welt",        defaultFile: "/sounds/crunch.wav",    defaultVolume: 0.32 },
  { key: "healReceived",    label: "Heilung erhalten",             group: "Welt",        defaultFile: "/sounds/chime.wav",     defaultVolume: 0.22 },
  { key: "battleStart",     label: "Kampf beginnt",                group: "Welt",        defaultFile: "/sounds/alarm.wav",     defaultVolume: 0.28 },
  { key: "rankUp",          label: "Rang aufgestiegen",            group: "Level & XP",  defaultFile: "/sounds/fanfare.wav",   defaultVolume: 0.38 },
  { key: "questStart",      label: "Quest gestartet",              group: "Battle Pass", defaultFile: "/sounds/ui-open.wav",   defaultVolume: 0.18 },
  { key: "warningAlert",    label: "Warnung empfangen",            group: "Chat",        defaultFile: "/sounds/alarm.wav",     defaultVolume: 0.30 },
  { key: "dailyLogin",      label: "Täglicher Login-Bonus",        group: "System",      defaultFile: "/sounds/reward.wav",    defaultVolume: 0.32 },
];

/** All sound files the admin can choose from. All files exist in public/sounds/. */
export const AVAILABLE_SOUND_FILES: { file: string; label: string; group: string }[] = [
  // ── Basis-Set (9 Originale) ─────────────────────────────────────────────
  { file: "/sounds/tick.wav",          label: "Tick",                    group: "Basis" },
  { file: "/sounds/hover.wav",         label: "Hover",                   group: "Basis" },
  { file: "/sounds/click.wav",         label: "Click",                   group: "Basis" },
  { file: "/sounds/save.wav",          label: "Save",                    group: "Basis" },
  { file: "/sounds/error.wav",         label: "Error",                   group: "Basis" },
  { file: "/sounds/hit.wav",           label: "Hit",                     group: "Basis" },
  { file: "/sounds/flip.wav",          label: "Flip",                    group: "Basis" },
  { file: "/sounds/win.wav",           label: "Win",                     group: "Basis" },
  { file: "/sounds/ultra-win.wav",     label: "Ultra-Win",               group: "Basis" },
  // ── UI / Feedback ───────────────────────────────────────────────────────
  { file: "/sounds/blip.wav",          label: "Blip (winzig)",           group: "UI" },
  { file: "/sounds/select.wav",        label: "Auswählen",               group: "UI" },
  { file: "/sounds/pop.wav",           label: "Pop",                     group: "UI" },
  { file: "/sounds/ui-open.wav",       label: "UI öffnen",               group: "UI" },
  { file: "/sounds/ui-close.wav",      label: "UI schließen",            group: "UI" },
  { file: "/sounds/success-soft.wav",  label: "Erfolg (sanft)",          group: "UI" },
  { file: "/sounds/success-hard.wav",  label: "Erfolg (stark)",          group: "UI" },
  // ── Belohnungen / Jingles ────────────────────────────────────────────────
  { file: "/sounds/coin.wav",          label: "Münze",                   group: "Belohnungen" },
  { file: "/sounds/coin-collect.wav",  label: "Münzen einsammeln",       group: "Belohnungen" },
  { file: "/sounds/ding.wav",          label: "Ding",                    group: "Belohnungen" },
  { file: "/sounds/reward.wav",        label: "Belohnung",               group: "Belohnungen" },
  { file: "/sounds/unlock.wav",        label: "Freischalten",            group: "Belohnungen" },
  { file: "/sounds/fanfare.wav",       label: "Fanfare",                 group: "Belohnungen" },
  { file: "/sounds/achievement.wav",   label: "Achievement",             group: "Belohnungen" },
  { file: "/sounds/levelup-epic.wav",  label: "Level-Up (episch)",       group: "Belohnungen" },
  { file: "/sounds/powerup.wav",       label: "Power-Up",                group: "Belohnungen" },
  { file: "/sounds/cheer.wav",         label: "Jubel",                   group: "Belohnungen" },
  // ── Glocken / Töne ───────────────────────────────────────────────────────
  { file: "/sounds/chime.wav",         label: "Chime (hell)",            group: "Glocken" },
  { file: "/sounds/chime-low.wav",     label: "Chime (tief)",            group: "Glocken" },
  { file: "/sounds/notification.wav",  label: "Benachrichtigung",        group: "Glocken" },
  { file: "/sounds/magic.wav",         label: "Magie / Funken",          group: "Glocken" },
  // ── Bewegung / Effekte ───────────────────────────────────────────────────
  { file: "/sounds/swoosh.wav",        label: "Swoosh (weit)",           group: "Effekte" },
  { file: "/sounds/whoosh.wav",        label: "Whoosh (kurz)",           group: "Effekte" },
  { file: "/sounds/warp.wav",          label: "Warp / Teleport",         group: "Effekte" },
  { file: "/sounds/laser.wav",         label: "Laser",                   group: "Effekte" },
  { file: "/sounds/zap.wav",           label: "Zap (elektrisch)",        group: "Effekte" },
  { file: "/sounds/glitch.wav",        label: "Glitch",                  group: "Effekte" },
  { file: "/sounds/alarm.wav",         label: "Alarm",                   group: "Effekte" },
  // ── Kampf / World ────────────────────────────────────────────────────────
  { file: "/sounds/punch.wav",         label: "Schlag",                  group: "Kampf" },
  { file: "/sounds/crunch.wav",        label: "Crunch (wuchtig)",        group: "Kampf" },
  { file: "/sounds/boom.wav",          label: "Boom (Bass)",             group: "Kampf" },
  { file: "/sounds/shield-block.wav",  label: "Schild blockiert",        group: "Kampf" },
  { file: "/sounds/sword-swing.wav",   label: "Schwertschwung",          group: "Kampf" },
  // ── Items / Welt ─────────────────────────────────────────────────────────
  { file: "/sounds/drop.wav",          label: "Item Drop",               group: "Items" },
  { file: "/sounds/place.wav",         label: "Ablegen / Platzieren",    group: "Items" },
  // ── Sonstiges ────────────────────────────────────────────────────────────
  { file: "/sounds/none",              label: "— Kein Ton —",            group: "Sonstiges" },
];

export const DEFAULT_SOUND_CONFIG: SoundConfig = Object.fromEntries(
  SOUND_EVENT_META.map((m) => [
    m.key,
    { file: m.defaultFile, volume: m.defaultVolume, enabled: true },
  ])
) as SoundConfig;
