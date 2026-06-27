<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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

## 7. Admin-Tabs IMMER alphabetisch

- Die Tab-Buttons im Admin-Panel (`components/admin/admin-shell.tsx`, `const TABS`) werden
  AUTOMATISCH alphabetisch (de) sortiert — das `.sort(...)` am Ende des Arrays erledigt das.
- Neue Tabs einfach IRGENDWO ins `TABS`-Array einfügen; sie ordnen sich von selbst ein.
  NIE manuell umsortieren und die `.sort(...)`-Zeile NICHT entfernen.
- Führende Emojis/Symbole im Label werden beim Sortieren ignoriert (`tabSortKey`).
