# 🗺️ ARCHITECTURE — System-Landkarte (ZUERST LESEN)

> **Für jede KI/Dev, die an dieser Seite arbeitet.** Dieses Dokument erklärt, wie ALLES
> zusammenhängt — Struktur, Verbindungen, Einbindungen, Daten-/Reward-/Mod-/Log-Kreisläufe.
> Lies es, **bevor** du irgendwo etwas änderst, damit du keine Verknüpfung übersiehst.
> Die verbindlichen Pflichtregeln stehen in `AGENTS.md` (§1–§10) — dieses Dok ist die
> *Karte dahinter*. Bei Widerspruch gewinnt AGENTS.md.

App: **„Goon'n Chill Cord"** — deutschsprachige, mature Gaming-Community.
Stack: **Next.js (modifiziert!) + Supabase (Postgres/RLS/Realtime) + React-Three-Fiber + Tailwind + framer-motion**, TypeScript strict.

---

## 0. Goldene Grundregeln (die nicht offensichtlichen)

1. **Das ist NICHT das Next.js aus deinem Training.** Breaking Changes möglich. Im Zweifel
   `node_modules/next/dist/docs/` lesen.
2. **DDL (ALTER/CREATE TABLE) NIE über den Supabase-JS-Client** — immer ein `scripts/*.cjs`
   mit der `pg`-Bibliothek. Connection-String: `DATABASE_URL` (Pooler), im Skript als
   Fallback hardcoded vorhanden. Skripte sind idempotent (`IF NOT EXISTS`, `ON CONFLICT`).
3. **Server vs Client streng trennen.** `lib/rewards-grant.ts` ist `import "server-only"` →
   **niemals Werte daraus in Client-Komponenten importieren** (Build bricht). Client-sichere
   Konstanten liegen in eigenen Modulen: `lib/bonus-games.ts`, `lib/bonus-card-themes.ts`.
   Muster: server-only-Modul re-exportiert die Client-Konstante für Back-Compat.
4. **`getSiteConfig` ist NICHT gecacht** (per-Request DB-Read). Config-Änderungen greifen nach
   hartem Reload, kein Redeploy nötig.
5. **Git:** Direkt auf `main` committen+pushen. Der Nutzer redeployed via Vercel-Auto-Build und
   macht **Strg+Shift+R** (Browser-Cache). KEINE Feature-Branches.
6. **Alle Antworten an den Nutzer auf Deutsch.**
7. **Realtime-Pflicht (AGENTS §3):** Alles, was ALLE sofort betrifft (Configs, Permissions),
   muss einen Broadcast auslösen — kein Reload. Siehe `broadcastPermissionChange()`,
   `broadcastLive()`, Channel `mod-permissions-live`, `friends:<uid>`, Presence.

---

## 1. Der ZENTRALE Reward-Kreislauf (Herzstück — AGENTS §9)

**Alles, was ein User bekommen kann, läuft über EINE Stelle:**

- `lib/rewards-grant.ts` → `grantReward(admin, userId, spec: RewardSpec, source)` deckt **9 Typen**:
  `credits | xp | item | random_item | ability | name_style | badge | case_voucher | game_bonus`.
  Einzel-Granter: `grantCredits/grantItem/grantAbility/grantNameStyle/grantBadge/grantCaseVoucher/grantGameBonus`.
- **`RewardSpec`** (Interface in rewards-grant.ts) = die kanonische Belohnung. game_bonus trägt
  zusätzlich Präsentation: `cardTheme/cardRarity/cardTitle/cardSubtitle`.
- **`components/admin/reward-spec-editor.tsx` `<RewardSpecEditor>`** = der EINE geteilte Editor
  für `RewardSpec[]`. Wird ÜBERALL benutzt: Gutschein-Vergabe, Battle Pass, Level-Road,
  Daily Quests, Streak, Admin-Direktvergabe. Key-Eingaben dort sind `<KeySelect>` (Dropdowns).

**Wer ruft grantReward? (alle „Surfaces"):**
`lib/actions/vouchers.ts` (`adminGrantVoucherToUsers`, `grantVoucherReward`), Battle Pass
(`battle-pass.ts` Tier-Claim), Level-Road (`level-system.ts`), Daily Quests, Streak, Shop,
Admin-Vergabe. → **Neuer Reward-Typ?** Zuerst in `RewardSpec` + `grantReward` + `RewardSpecEditor`,
dann ist er automatisch überall nutzbar.

---

## 2. „Alles ist ein Gutschein" — das vereinheitlichte Modell

Konzept des Nutzers: **alle erhaltbaren Dinge = Gutscheine** (Credit-/Item-/Fähigkeits-Gutschein …).
Das Wort „Fähigkeit" ist aus den **sichtbaren** Texten verschwunden (Logik-Keys bleiben englisch
`ability`).

- **KEINE Gutschein-CODES mehr** (Erstellung + Einlösen entfernt). Gutscheine kommen NUR durch:
  (a) Admin-Direktvergabe (`adminGrantVoucherToUsers`), (b) automatisch (Battle Pass/Level/Quests/Shop/Gewinne).
- **Fähigkeits-Gutscheine** = `ability_definitions` (key/name/effectType/effectValue/effectConfig/
  rarity/icon/…/`card_theme`/`card_rarity`). Werden **ausgerüstet** (`equipAbility`), Effekt wirkt
  über `equippedEffectValue(eff, type)` (`lib/abilities.ts`: Primär-Effekt + `effectConfig[type]`,
  additive Kombo über mehrere Spiele). 25 aktive Presets (Key-Präfix `v_`), die 20 alten sind
  `enabled=false` (deaktiviert, reversibel).
- **Direkt-Fähigkeits-Vergabe im Admin wurde ENTFERNT** (Doppelung) — nur noch via Gutschein.

### Spiel-Boni (game_bonus = „Extra-Spins")
- `grantGameBonus` schreibt in **`game_bonus_allowances`** (game/amount/used/expires_at/source/
  `card_theme`/`card_rarity`/`card_title`/`card_subtitle`). `cardRarity="auto"` wird BEI VERGABE
  über die konfigurierten Stufen zu konkreter Seltenheit aufgelöst.
- **Verbrauch:** `consumeGameBonus(admin, userId, game)` (RPC `consume_game_bonus`) wird in
  **DON** (`double-or-nothing.ts`, stündl.+tägl. Limit), **Plinko** (`plinko.ts`), **Snake**
  (`snake.ts`) aufgerufen, sobald das normale Limit erreicht ist → Bonus zählt „on top".
  `BONUS_GAMES = ["plinko","snake","don"]` (`lib/bonus-games.ts`).
- **Anzeige:** `components/rewards/active-bonus-dock.tsx` `<ActiveBonusDock game>` = klickbarer
  Pill-Button in DON/Plinko/Snake → Popup mit `<BonusCard>` (`components/rewards/bonus-card.tsx`).
  Daten via `lib/actions/bonus-cards.ts` `getActiveBonusCards(game)`.

### Karten-Themes (Visualisierung)
- `lib/bonus-card-themes.ts` (client-safe): `BONUS_CARD_THEMES` (10 Themes inkl. `rgb` = Ultra,
  animiert via globals.css `.bonus-rgb-bg`), `BONUS_CARD_RARITIES` (normal/selten/episch/mythisch/
  ultra). **Auto-Logik:** `rarityFromAmount(amount, tiers)` → Seltenheit aus Stärke;
  `RARITY_THEME` → Theme aus Seltenheit (ultra→rgb); `resolveCardRarity`/`resolveCardTheme`
  lösen `"auto"` auf. `DEFAULT_RARITY_TIERS` (Code-Default) vs **editierbare Stufen** in
  `site_config.rarity_tiers` (`lib/actions/rarity-tiers.ts` get/save, Editor in voucher-admin-tab).
- Karten: `<BonusCard>` (game_bonus), `<AbilityVoucherCard>` (`components/rewards/ability-voucher-card.tsx`,
  Fähigkeits-Gutscheine in der Garderobe + Admin-Vorschau). Theme-Farben IMMER Inline-Styles
  (keine dynamischen Tailwind-Klassen → Purge).

---

## 3. Garderobe (Spieler-Sicht) = EINE „Gutscheine"-Rubrik

- `app/garderobe/page.tsx` → `components/wardrobe/wardrobe-shell.tsx`.
- Avatar (`CharacterViewer`) bleibt oben; darunter **eine Rubrik „Meine Gutscheine"** mit
  Typ-Chips (State `rubric`): **Ausrüstung (Items, virtualisierte Liste)** · **Fähigkeits-Gutscheine**
  (`components/garderobe/abilities-section.tsx`, equip bleibt) · **Style-Gutscheine** (`NameStyleSection`)
  · **Boni** (`VouchersSection`: case_tokens + game_bonus) · **Badges** (`PrioBadgeSelectionSection`).
- Item-Equip = `handleToggle`; Item-Vorschau = `UniversalPreviewModal`.

---

## 4. Admin-Panel (`components/admin/admin-shell.tsx`) — AGENTS §7

Tabs sind in `TAB_GROUPS` gruppiert. **Neuen Tab? An 6 Stellen eintragen:** `Tab`-Union, `TABS`,
`TAB_GROUPS`, `TAB_DESC`, `SEARCH_INDEX` (Suche!), `lib/admin-guides.ts` `TAB_GUIDES`, + Render-Block.
- **SEARCH_INDEX** (Zeile ~177): jeder Eintrag `{label, tab, keywords[], description}`. Neue Features
  MÜSSEN dort als Stichworte rein, sonst unauffindbar.
- Wichtige Tabs: `givables` (Fähigkeits-Gutscheine + Gutschein-Vergabe + Seltenheits-Stufen),
  `audit` (Aktivitätslog), `cleanup` (Retention), `chat`, `battlepass`, `economy`, `games`, `theme`.

---

## 5. Balance-Cockpit — AGENTS §8

`components/admin/balance-cockpit.tsx` (Daten via `getBalanceSnapshot()` in
`lib/actions/balance-studio.ts`) = zentrale Übersicht ALLER Werte/Preise/Belohnungen + „Grind"-Analyse.
**Jeder neue wirtschaftliche Wert** muss dort als Kategorie/Eintrag erscheinen UND per
`onJump(tab, anchor)` zum echten Editor springen (Anker `id="…"` setzen).

---

## 6. System-Health (`lib/actions/system-health.ts`) — AGENTS §1, PFLICHT

Zentraler Prüfbericht. **Jede DB-Änderung** ergänzen:
`REQUIRED_TABLES`/`OPTIONAL_TABLES` (neue Tabelle), `COLUMN_CHECKS` (ALTER ADD COLUMN, mit
`detail = node scripts/...cjs`), `SINGLETON_CONFIGS` (1-Zeilen-Config), eigener Block in
`runSystemHealthChecks()` (neues Feature), `envVars` (neue Env). Der Debug-/Systemstatus muss
immer 100% grün/vollständig sein.

---

## 7. Keys IMMER als Dropdown — AGENTS §10

Jede Key-Eingabe (ability/name_style/badge/item/case_tier) im Admin = `<KeySelect kind=…>`
(`components/admin/key-select.tsx`), Optionen aus `getAdminKeyOptions()`
(`lib/actions/admin-key-options.ts`, geteilter Cache + 15s-TTL). Effekt-Typ-Keys (effectConfig)
= eigenes Dropdown in `ability-admin-tab.tsx` aus `ABILITY_EFFECT_META`. **Kein Freitext-Key.**

---

## 8. Mod-System & Berechtigungen

- **`lib/mod.ts`** (NICHT "use server" — reine Typen/Konstanten): `ModPermissions` (alle Rechte,
  u.a. `canViewTickets/canTempBanUsers/maxTempBanHours/canClearChat/canMuteChat/maxChatMuteHours/
  canViewAuditLog/…`), `DEFAULT_MOD_PERMISSIONS` (Mod), `ADMIN_MOD_PERMISSIONS` (Admin).
  Globale Defaults liegen in **Tabelle `mod_permissions`** (id='default'); Per-Mod-Override =
  `profiles.mod_permissions_override` (JSONB, Partial → Feld fehlt = erbt Standard).
- **`lib/actions/mod.ts`**: `effectivePerms()` (Admin→ADMIN, Mod→Defaults+Override), 
  `getMyEffectivePermissions()`, `updateModPermissions()`, `setModUserPermissions()`,
  `broadcastPermissionChange()` (Channel `mod-permissions-live` — IMMER nach Änderung aufrufen).
  Mod-Aktionen (warn/note/temp_ban/credits/chat_mute/chat_unmute) → Tabelle `mod_actions`.
- **UI:** `mod-config-editor.tsx` (global, Allow/Deny-Toggles), `mod-user-permissions-editor.tsx`
  (per-Mod **Drei-Zustand**: Erlaubt grün✓ / Standard grau-erbt / Gesperrt rot✕). `mod-shell.tsx`
  = Mod-Oberfläche (subscribt `mod-permissions-live` → lädt Perms neu).
- **Profilkarten-Mod-Aktionen:** klein = `components/ui/profile-popup-provider.tsx` (FriendButton +
  kompakter Chat-Mute), groß = `components/community/profile-modal.tsx` `ModPanel` (Warn/Note/
  TempBan/Credits/Chat-Mute, je permission-gated).

---

## 9. Logging & Retention

- **Tabellen:** `audit_logs` (user_id/action/payload/created_at — Spieler- UND Admin/Mod-Aktionen),
  `debug_logs` (System-Fehler/Info). Helfer: `logAdminAction` (admin.ts), `logDebugEvent`/
  `logActivity`/`logAndRethrow` (`lib/debug-log-server.ts`). Spiel-/Wirtschaftsaktionen loggen
  inline `admin.from("audit_logs").insert({user_id, action, payload})` (non-fatal try/catch).
- **Anzeige:** `components/admin/audit-timeline.tsx` `<AuditTimeline>` — `ACTION_META` (deutsche
  `format()` pro action, Fallback für unbekannte). `buildGroups()` bündelt **aufeinanderfolgende
  gleiche** (user_id+action) → ein Sammel-Eintrag + animiertes Dropdown. Auch in der Mod-Shell
  (Tab „Aktivitätslog", gated `canViewAuditLog`, Action `getAuditLogForMod`).
- **Retention/Cleanup:** `lib/cleanup-config.ts` (`CLEANUP_SOURCE_META`, `PLAYER_ACTIVITY_ACTIONS`),
  `lib/actions/cleanup-config.ts` (`getCleanupRules`/`updateCleanupRule`/`runAllEnabledCleanups`/
  `deleteSource`). Quelle **`player_activity`** = Spieler-Aktivität, default **1 Tag (24h),
  defaultEnabled=true** (löscht automatisch); `audit_logs`-Quelle = Admin/Mod-Audit (90d). Auto:
  **`app/api/cron/cleanup/route.ts`** + `vercel.json` (stündlich), `CRON_SECRET` optional.
- **Neue loggbare Aktion?** (a) Insert in audit_logs, (b) action in `PLAYER_ACTIVITY_ACTIONS`
  (sonst gilt sie als Admin/Mod-Audit), (c) `ACTION_META`-Eintrag mit deutschem Label.

---

## 10. Notifications

`lib/notifications-internal.ts` `notifyUser({userId, type, title, message, link})` → Tabelle
`notifications`. Respektiert `profiles.notification_prefs` (JSONB) außer `NON_TOGGLEABLE_USER_TYPES`.
UI: `components/layout/notifications-bell.tsx` (rendert `link` als `<Link>` → Deep-Link).
**Deep-Links müssen auf echte Routen zeigen** (`/profil` existiert NICHT → `/garderobe`!).
Toggles im Account: `components/account/notification-prefs-section.tsx` (Gruppen inkl. „Soziales").

---

## 11. Social / Freunde

`lib/actions/friends.ts` (friend_requests/friendships/blocked_users). Zugang über eigene
**`/friends`-Seite** (`app/friends/page.tsx` + `friends-page-shell.tsx`) mit Spieler-SUCHE
(`searchAddableUsers`). **WICHTIG:** KEIN schwerer globaler Popover-Trigger in die Topbar mounten
— das brach Mobile (alle Seiten außer Startseite tot). Topbar/Mobile-Drawer = LINK auf /friends.
Profil-Popup öffnen via Event `gnc:open-profile-popup`; Freunde via `gn:open-friends`.
Setting `profiles.accept_friend_requests` blockt Anfragen. Presence: `lib/presence-client.ts`
(EIN geteilter Channel, `subscribeToPresence`/`trackPresence`).

---

## 12. Chat

`lib/actions/global-chat.ts` `sendGlobalChatMessage` prüft `profiles.temp_banned_until` (Voll-Ban)
UND `profiles.chat_muted_until` (NUR Chat-Stumm, eigenständig). `clearGlobalChat` (canClearChat).
Config = `ChatConfig` (lib/mod.ts). UI: `components/global/global-chat-panel.tsx` (Sende-Fehler
wird unterm Eingabefeld angezeigt).

---

## 13. Topbar & Mobile

`components/layout/top-bar.tsx`: Slots aus `site_config.topbar_right_slots` (**Postgres `text[]`**,
NICHT jsonb!) überschreiben `DEFAULT_TOPBAR_RIGHT_SLOTS`. `renderSlot()` pro Slot, Wrapper
`hidden xl:flex` (≥1280px). Mobile = Hamburger → `components/layout/mobile-nav-drawer.tsx`.
**Lektion:** Startseite hat KEINE Topbar; schwere stateful Trigger global = Mobile-Crash.

---

## 14. 3D / Visuals

drei `<View>` + EIN geteiltes `<Canvas><View.Port/></Canvas>` (vermeidet WebGL-Context-Limit).
`UniversalPreviewModal` (Items/Badges/Name-Styles, lazy), `BonusCard`/`AbilityVoucherCard` (Theme-
Karten), Welt-Modelle. Animationen: framer-motion + globals.css keyframes (`bonus-sheen`, `bonus-rgb`).

---

## 15. Spiele-Übersicht (Limits + Logging + Bonus)

| Spiel | Action-Datei | Config | Limit | game_bonus | audit action |
|------|--------------|--------|-------|-----------|--------------|
| DON | double-or-nothing.ts | don_config | stündl.+tägl. Flips | ✅ consume | double_or_nothing |
| Plinko | plinko.ts | plinko_config | stündl.+tägl. Bälle | ✅ consume | plinko_play |
| Snake | snake.ts | snake_config | daily_cr_limit (Verdienst) | ✅ consume | snake_* |
| Mine | mine.ts | mine_config | Lager-Stunden/Level | ❌ | mine_collect/upgrade |
| Cases | cases.ts | case_tiers | Credits-Kosten | ❌ | case_open |
| Kill-Streak | kill-streak.ts | — | Multiplier-Progression | ❌ | streak_* |
| Parkour | parkour.ts | parkour_config | daily_rewarded_finishes (Belohnungs-Cap) | ❌ | parkour_finish |

**Parkour (3D Jump & Run, `/parkour`)** — eigenes AAA-Standalone-Spiel, das die Farmwelt-Engine
(`use-camera-controls`/`use-keyboard-controls`/`CharacterModel`) wiederverwendet, aber eine eigene
**AABB-Plattform-Physik** hat (`components/parkour/parkour-player.tsx`: Gravitation/Doppelsprung/
Coyote-Time, Landen auf Plattform-Oberseiten, bewegliche Plattformen mitfahren, Checkpoints,
Void-Respawn, Eis/Sprungpad/Hazard). **4 Maps** sind Code-Daten in `lib/parkour-config.ts`
(client-safe; Physik/Rewards per Admin-Override, Geometrie NIE in der DB). Bestenliste ms-genau
(`parkour_best_times`), Solo + Randomizer + **Multiplayer-Lobbys** (`parkour_lobbies`/
`_lobby_members` + `lib/parkour-realtime.ts` Ghost-Sync, Freunde-Einladung via `notifyUser`).
**Lobby-Lifecycle (parkour-shell.tsx):** EINE Quelle der Wahrheit `handleLobbyUpdate` (aus dem
`parkour-lobby:<id>`-Broadcast) entscheidet **Spielen vs. Zuschauen vs. Rauswurf**: „Resident"
(war bei Status `open` dabei) → rennt jeden Lauf; Spät-Beitritt mitten im Lauf → **Zuschauermodus**
(`parkour-spectator.tsx`, cinematische Follow-Kamera, kein Pointer-Lock, Spielerwahl). Host-Weg
schließt die Lobby für alle: (a) explizit `leaveParkourLobby`/`endParkourLobbyRun`, (b) Seite
verlassen = pagehide/unmount-Leave, (c) Presence-Grace-Rauswurf der Mitglieder, (d) Host-Heartbeat
`last_seen_at` + Cron/`scripts/close-stale-parkour-lobbies.cjs` schließt hart abgestürzte Hosts
false-positive-frei. Einladung: Notification-Link `/parkour?lobby=` → Prop `initialLobbyId` (auch
bei Client-Nav) → Join-Effekt (abgelehnter Join = kein Phantom, nur Toast). **Physik-Vertrag:**
Lande-Reichweite = R (Fußabdruck), KEIN Pull-in-Teleport mehr (das war der Kanten/Ecken-Ruck);
Luft-Steuerung = Farmwelt (ACCEL 14). `scripts/validate-parkour-maps.mjs` MUSS synchron zu den
Engine-Konstanten bleiben und alle 4 Maps beweisen.
Rewards über `grantReward` (credits/xp), gedeckelt per Tages-Cap. Admin-Tab „Parkour", Cockpit-
Einnahmequelle, System-Health-Block, Audit `parkour_finish`.
**Solide Blöcke:** Plattformen sind volle AABB-Körper — Seiten-Kollision (`resolveSideAxis`) +
Head-Bonk, kein Durchspringen; der Validator (`scripts/validate-parkour-maps.mjs`) modelliert das
mit und beweist alle 4 Maps schaffbar. **Umgebung:** `components/parkour/parkour-environment.tsx`
liefert pro Map eine kinofertige Kulisse (Neon-Skyline / Dawn-Inseln / Lava-Welt / Kosmos) —
rein dekorativ, geteilte Materialien, EIN allokationsfreies Partikelfeld pro Theme, keine Schatten.
**Audio:** SFX über den zentralen SoundManager (Events `pkJump/pkDouble/pkLand/pkDash` als
Interrupt-Kanäle, `pkCheckpoint/pkFinish/pkFall/pkHazard` als Fx; in `sound-config.ts` registriert,
Admin-konfigurierbar). BGM über das Musiksystem: neue `MusicPageKey "parkour"` + Per-Map-Modi
(`MUSIC_PAGE_MODES.parkour`, gesetzt via `setMusicMode(map.id.split("_")[0])`), sodass jede Map
ihren eigenen Track hat. `resolveTrackId` fällt für neue Seiten/Modi auf die Defaults zurück (kein
DB-Migrationszwang).

---

## 16. Integrations-Checkliste — „Wenn du X baust, fass Y an"

- **Neuer Reward-Typ** → RewardSpec + grantReward + RewardSpecEditor (+ describeRewardSpec in lib/vouchers.ts).
- **Neue DB-Tabelle/Spalte** → `scripts/*.cjs` (pg, idempotent, RLS) + system-health (§1).
- **Neuer wirtschaftlicher Wert/Preis** → Balance-Cockpit `getBalanceSnapshot` + onJump-Anker (§8).
- **Neuer Admin-Tab** → 6 Stellen in admin-shell + admin-guides (§7) + SEARCH_INDEX.
- **Neue Key-Eingabe** → `<KeySelect>` + ggf. `getAdminKeyOptions` erweitern (§10).
- **Neues Mod-Recht** → ModPermissions + DEFAULT/ADMIN + mod_permissions-Spalte + beide Editoren +
  Gate an der Funktion + `broadcastPermissionChange()`.
- **Neue loggbare Aktion** → audit_logs-Insert + PLAYER_ACTIVITY_ACTIONS + ACTION_META (deutsch).
- **Etwas, das alle sofort betrifft** → Realtime-Broadcast (§3), kein Reload.
- **Client-Komponente braucht eine Konstante aus server-only-Code** → Konstante in ein client-sicheres
  Modul auslagern + re-exportieren (NIE aus rewards-grant importieren).
- **Neue Notification** → notifyUser + sinnvoller `link` (echte Route!) + ggf. Toggle in prefs-section.
- **Neuer Sound (SFX)** → `FxSound`-Union + `DEFAULT_FX_SRC`/`DEFAULT_FX_VOL` (`lib/sound-manager.ts`) + Methode im
  `useSoundManager`-Export + Aufruf am Event. **Neue BGM-Tempo-Quelle** → `setMusicTempoMult()` NUR auf
  Events (siehe §19).

---

## 17. Bekannte Lektionen / Stolperfallen

- **Mobile-Crash** durch global gemountete schwere Popover-Trigger (Friends/Quests). Lösung: Seiten + Links.
- **server-only-Import im Client** = Build-Bruch (rewards-grant). → bonus-games/bonus-card-themes.
- **`/profil` ist keine Route** (404). Profil = Popup/Modal, kein Seitenpfad.
- **topbar_right_slots = text[]**, nicht jsonb (Param als JS-Array, nicht JSON.stringify).
- **getSiteConfig nicht gecacht** → DB-Override gewinnt sofort über Default.
- **`mod_permissions.reward_type`-artige CHECK-Constraints** beachten (z.B. Gutschein-Legacy-Spalte).
- **LF→CRLF-Warnungen** beim Commit sind harmlos (Windows).

---

## 18. Zustand (Stand 2026-06-29)

Funktionsketten geschlossen: Gutschein **konfigurieren → vergeben/gewinnen → als themed Karte anzeigen
→ einlösen/ausrüsten/verbrauchen → loggen → automatisch aufräumen**. Vereinheitlichung „alles ist
Gutschein" abgeschlossen (Codes raus, Fähigkeits-Framing, eine Rubrik, Auto-Seltenheit/RGB,
editierbare Stufen). Logging vollständig (Abdeckung/Gruppierung/24h-Retention/Cron/Mod-Recht).
Detail-Historie der Sessions: siehe Memory `project_goon_chill.md` (KI-Memory, nicht im Repo).

---

## 19. Audio — BGM + SFX (Zero-Overlap & gestuftes Tempo)

Zwei **vollständig getrennte** Audio-Wege, die sich nie gegenseitig wegdrücken:

### SFX (Soundeffekte) — `lib/sound-manager.ts`
- Client-Singleton `useSoundManager()`. **Interrupt-Kanäle** (`tick`/`hover`/`hit`) = je EIN
  wiederverwendetes `<audio>`, restart-on-call, nie gequeuet. **Alle anderen** FX laufen durch eine
  FIFO-Queue (`play()`), damit sich zwei Effekte nie überlappen. Datei/Volume pro Event aus
  `DEFAULT_FX_SRC`/`DEFAULT_FX_VOL`, override via `SoundConfig` (Admin „Sound Manager"-Tab).
- **Logging:** Schlägt ein Sound fehl (fehlende/defekte Datei, kein Autoplay-Reject), wird EINMAL pro
  Event-Key in `debug_logs` geloggt — via `lib/actions/audio-log.ts` `reportAudioIssue` (Bridge zum
  server-only `logDebugEvent`). Dedup-Set wird bei `loadConfig` zurückgesetzt.

### BGM (Hintergrundmusik) — `components/global/music-player.tsx`
- EINE Instanz (in `app/layout.tsx`). Synth-Tracks (`synth://…`) via `lib/music-synth.ts` (eigener
  AudioContext), File-Tracks via einem `<audio>`. Track-/Volume-Zuweisung pro Seite/Modus aus
  `MusicConfig` (`lib/music-config.ts`, Admin „Hintergrundmusik"-Tab, broadcastet auf `music-live`).
- **Zero-Overlap (unzerstörbar):** (1) `MusicSynth` hat einen **`startToken`** — jedes `start()`/`stop()`
  bumpt ihn; in-flight async-Starts und ausstehende Loop-Callbacks brechen ab, sobald ein neuerer Start
  übernimmt → es kann nie ein **Geister-Loop** zwei Patterns gleichzeitig spielen. (2) Der Player hat
  einen **`transitionSeqRef`** — überlappende `applyRoute`-Aufrufe (Route + Mode + Config gleichzeitig)
  werden serialisiert, nur die **letzte** Transition startet einen Track (latest-wins).

### Gestuftes, gehaltenes Tempo — `lib/music-dynamics.ts`
- EIN Kanal: `setMusicTempoMult(mult)` / `getMusicTempoMult()` / `resetMusicTempoMult()` /
  `subscribeMusicTempoMult()`. **Vertrag:** wird NUR bei einem echten Spiel-Event gesetzt (z.B. Apfel
  gegessen), nie pro Frame; der Wert **hält** verbatim bis zum nächsten Event — kein Decay, kein Spike.
- Snake (`snake-shell.tsx`) setzt in `doTick` beim Essen: `min(musicTempoMax, 1 + score·musicTempoPerApple)`
  und `resetMusicTempoMult()` bei Start/Tod/Abbruch. Per-Modus-Config: `musicDynamicsEnabled`,
  `musicTempoMax`, `musicTempoPerApple` (`lib/snake-config.ts`, persistiert in `snake_config.modes_config`
  JSONB; Editor-UI im Snake-Tab „Musik-Dynamik"). `setMusicMode()` steuert separat die Per-Modus-Track-Wahl.
- **Stolperfalle:** Tempo NIE im RAF-Loop pushen (verursachte den „überschlägt sich"-Bug) — immer nur
  am diskreten Event.
