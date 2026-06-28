<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 🗺️ ZUERST LESEN: `ARCHITECTURE.md`

**Bevor du IRGENDWO etwas änderst, lies `ARCHITECTURE.md` im Projekt-Root.** Das ist die
vollständige System-Landkarte: wie alles zusammenhängt, welche Systeme es gibt (Reward-Dispatcher,
Gutscheine/Bonus-Karten, Mod-Permissions, Logging/Retention, Notifications, Friends, Chat, Topbar,
3D), wie sie verbunden sind, und eine Integrations-Checkliste „wenn du X baust, fass Y an". Diese
AGENTS.md hier sind die verbindlichen Pflichtregeln; ARCHITECTURE.md ist die Karte dahinter. So
übersiehst du keine Verknüpfung und verstehst sofort, wie/wo/wann etwas eingebunden werden muss.

---

# ⚠️ PFLICHTREGELN FÜR ALLE KIs / AGENTS — UNBEDINGT LESEN ⚠️

## 1. Health-Check ist PFLICHT bei jeder Änderung

Die Datei `lib/actions/system-health.ts` ist der zentrale System-Prüfbericht der gesamten Site.

**Jedes Mal wenn du:**
- Eine neue Datenbanktabelle erstellst → `REQUIRED_TABLES` oder `OPTIONAL_TABLES` ergänzen
- Ein `ALTER TABLE … ADD COLUMN` machst → `COLUMN_CHECKS` Eintrag hinzufügen
- Einen neuen Config-Singleton anlegst (z.B. `some_config` mit genau 1 Zeile) → `SINGLETON_CONFIGS` ergänzen
- Ein neues Feature baust (Shop, Battle Pass, Snake, DON, etc.) → Eigenen Check-Block in `runSystemHealthChecks()` anlegen

**Diese Pflicht gilt absolut. Ohne Ausnahme. Kein neues Feature ohne Health-Check.**

### Was muss in den Health-Check?

| Was geändert?                        | Was in system-health.ts?                                  |
|--------------------------------------|-----------------------------------------------------------|
| Neue Tabelle (Pflicht)               | Eintrag in `REQUIRED_TABLES`                              |
| Neue Tabelle (optional/future)       | Eintrag in `OPTIONAL_TABLES` mit Migration-Pfad           |
| Neue Spalte (ALTER TABLE ADD COLUMN) | Eintrag in `COLUMN_CHECKS`                                |
| Neuer Config-Singleton (1-Zeilen-TB) | Eintrag in `SINGLETON_CONFIGS`                            |
| Neues Feature (eigene Logik)         | Eigenständiger Block in `runSystemHealthChecks()`         |
| Neue Env-Variable                    | Eintrag im `envVars`-Array in `runSystemHealthChecks()`   |

## 2. Supabase / DB-Arbeit

- Verwende für DDL (ALTER TABLE, CREATE TABLE) immer die `pg`-Bibliothek direkt
  (Supabase JS-Client kann kein DDL ausführen).
- Migrations-Skripte gehören nach `scripts/` mit dem Suffix `.cjs` (CommonJS, da die meisten
  Node-Versionen ESM-Module in Scripts nicht direkt unterstützen).
- DB-Verbindungsstring: In `.env.local` unter `DATABASE_URL` (Format: `postgresql://postgres.PROJECT:PASSWORT@aws-0-eu-west-1.pooler.supabase.com:6543/postgres`)
- RLS immer aktivieren bei neuen Tabellen: `ALTER TABLE … ENABLE ROW LEVEL SECURITY`

## 3. Live-Updates (Supabase Realtime)

- Permission-Änderungen müssen `broadcastPermissionChange()` aufrufen (in `lib/actions/mod.ts`).
- Der Mod-Shell-Client subscribt auf Channel `"mod-permissions-live"` und ruft
  `getMyEffectivePermissions()` auf bei jedem Broadcast-Event.
- Alles was ALLE User sofort betrifft (Konfigurationen, Berechtigungen) muss einen
  Realtime-Broadcast nutzen — kein Reload, kein manuelles Refresh.

## 4. TypeScript strict

- TypeScript strict-Mode ist aktiv. Jeder Type-Error ist ein Build-Fehler.
- Wenn du ein Interface erweiterst (z.B. `ModPermissions`), alle Stellen aktualisieren die
  das Interface implementieren oder konstruieren (Aktionen, Config-Editoren, etc.).

## 5. Server Actions

- Alle DB-Zugriffe gehen über Server Actions (`"use server"`), nie direkt vom Client.
- Admin-Operationen verwenden immer `createAdminClient()` (Service Role), nie den User-Client.
- User-seitige Abfragen verwenden `createClient()` (RLS-enforced).

## 6. Sicherheit

- Keine SQL-Injection: immer parametrisierte Queries oder Supabase-Client-Methoden.
- Keine XSS: kein `dangerouslySetInnerHTML` ohne Sanitization.
- Admin-Prüfung: `isAdmin(profile)` vor jeder sensiblen Operation.
- Mod-Prüfung: `requireMod()` vor jeder Mod-Operation.

## 7. Admin-Tabs sind GRUPPIERT (nicht mehr nur alphabetisch)

Das Admin-Panel (`components/admin/admin-shell.tsx`) ist in logische Gruppen unterteilt (`TAB_GROUPS`).
Wenn du einen NEUEN Tab hinzufügst, musst du ihn an ALLEN diesen Stellen eintragen:
- `Tab`-Union (oben) → neue ID ergänzen
- `TABS`-Array → `{ id, label, icon }` (bleibt für Suche/Validierung `.sort(...)`-sortiert — Zeile NICHT entfernen)
- `TAB_GROUPS` → die ID in die passende Gruppe einsortieren (sonst erscheint der Tab nirgends!)
- `TAB_DESC` → eine Kurzbeschreibung (Tooltip + Suche)
- `lib/admin-guides.ts` `TAB_GUIDES` → einen Guide (Cases-Tiefe: hierarchy/steps/howItWorks/glossary)
- Den Render-Block `{tab === "…" && <… />}`

## 8. Balance-Cockpit ist PFLICHT bei jedem neuen Wert/Preis

Das **Balance-Cockpit** (`components/admin/balance-cockpit.tsx`, Daten via `getBalanceSnapshot()`
in `lib/actions/balance-studio.ts`) ist die zentrale Übersicht ALLER Werte, Preise, Belohnungen,
Kosten und Auszahlungen der gesamten Seite — inkl. „wie lange muss man dafür grinden"-Analyse.

**Jedes Mal wenn du IRGENDWO einen Wert mit wirtschaftlicher Bedeutung hinzufügst oder änderst**
(Item-Preis, Shop-Preis/Multiplikator, Fähigkeits-/Style-/Badge-Preis, Case-Preis, Spiel-Auszahlung,
XP-/Level-/Streak-/Quest-/Battle-Pass-Belohnung, Gutschein-Wert, Monster-Belohnung, Upgrade-Kosten …):

1. **Anbinden ans Cockpit:** Den neuen Wert/Preis in `getBalanceSnapshot()` als Kategorie/Eintrag
   ergänzen, sodass er im Cockpit erscheint UND in die Verdienst-vs-Preis-Analyse einfließt.
2. **Sprung ermöglichen:** Der Cockpit-Eintrag muss per `onJump(tab, anchor)` zum echten Editor
   springen (Anker `id="…"` im Ziel-Editor setzen, wo möglich — virtualisierte Listen = Tab-Anfang).
3. **Verdienst-Quellen:** Neue Einnahme-/Verdienst-Quellen (neues Spiel, neue Belohnung) als
   Baseline-Option ins Cockpit aufnehmen.

**Diese Pflicht gilt absolut. Kein neuer Wert/Preis ohne Cockpit-Anbindung.** Alles, was die
Wirtschaft der Seite betrifft, MUSS zentral im Balance-Cockpit sicht- und vergleichbar sein —
einzeln (jeder Eintrag) UND im Gesamtbild (eine Quelle der Wahrheit).

## 9. Belohnungen laufen über den ZENTRALEN Reward-Dispatcher

`lib/rewards-grant.ts` ist die EINE Stelle, an der Belohnungen vergeben werden:
`grantReward(admin, userId, spec: RewardSpec, source)` deckt ALLE Typen ab
(credits, xp, item, random_item, ability, name_style, badge, case_voucher, game_bonus).
Einzel-Granter: grantCredits/grantItem/grantAbility/grantNameStyle/grantBadge/grantCaseVoucher/grantGameBonus.

- **Jede Surface, an der ein User etwas bekommt** (Battle Pass, Level-Road, Daily Quests, Streak,
  Shop, Gutschein-Codes, Admin-Vergabe), soll ihre Belohnung auf `RewardSpec` mappen und
  `grantReward(...)` aufrufen — NICHT die DB-Inserts neu implementieren.
- **Neuer Reward-Typ?** Zuerst in `RewardSpec` + `grantReward` ergänzen, DANN in den Surfaces
  (Typ-Union, Admin-Picker-UI, Mapping) verfügbar machen. So ist alles überall nutzbar.
- Ziel des Nutzers: ÜBERALL, wo man etwas bekommen kann, müssen ALLE Belohnungs-Typen wählbar sein.

## 10. Keys IMMER als Auto-Dropdown (kein Freitext)

Jede Eingabe eines Keys (ability_key, name_style_key/styleKey, badge_key, item_id,
case_tier_id) im Admin MUSS ein Dropdown mit allen verfügbaren Keys sein — NIE ein
Freitext-Input. Nutze dafür `<KeySelect kind="ability|name_style|badge|item|case_tier" value onChange />`
(`components/admin/key-select.tsx`). Die Optionen kommen aus `getAdminKeyOptions()`
(`lib/actions/admin-key-options.ts`) und aktualisieren sich automatisch (geteilter
Cache + TTL). **Neue Key-Kategorie?** Zuerst in `getAdminKeyOptions` + `AdminKeyOptions`
ergänzen, dann `<KeySelect>` verwenden. So bekommt der Admin überall eine
sich selbst aktualisierende Auswahl statt Tippfehler-anfälliger Freitext-Keys.
