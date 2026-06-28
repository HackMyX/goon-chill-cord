// Central content for the per-tab admin guides (rendered by components/admin/
// admin-guide.tsx above each tab). Pure data — no JSX, no logic. A guide is
// added/edited here only; the tab components themselves are never touched.
//
// Tabs that already ship their own in-tab guide (Battle Pass, Economy & Cases)
// are intentionally NOT listed here to avoid a duplicate panel.

export interface AdminGuideBlock {
  heading: string;
  lines: string[];
}

export interface AdminGuideContent {
  title: string;
  subtitle: string;
  /** "Hierarchie auf einen Blick" — flow cards (left→right). */
  hierarchy?: { label: string; text: string }[];
  /** Numbered "Schritt für Schritt". */
  steps?: { title: string; text: string }[];
  /** Highlighted "wie es funktioniert / wichtig" box. */
  howItWorks?: { heading: string; lines: string[] };
  /** General bullet sections. */
  blocks?: AdminGuideBlock[];
  /** "Begriffe in einem Satz" — term → definition. */
  glossary?: { term: string; def: string }[];
  tip?: string;
}

/** Flattens an entire guide into one searchable text blob so the admin search
 *  can match ANY word from ANY line of the guide. */
export function guideSearchText(c: AdminGuideContent): string {
  const parts: string[] = [c.title, c.subtitle];
  c.hierarchy?.forEach((h) => parts.push(h.label, h.text));
  c.steps?.forEach((s) => parts.push(s.title, s.text));
  if (c.howItWorks) parts.push(c.howItWorks.heading, ...c.howItWorks.lines);
  c.blocks?.forEach((b) => parts.push(b.heading, ...b.lines));
  c.glossary?.forEach((g) => parts.push(g.term, g.def));
  if (c.tip) parts.push(c.tip);
  return parts.join(" ").toLowerCase();
}

export const TAB_GUIDES: Record<string, AdminGuideContent> = {
  balance: {
    title: "So funktioniert das Balance Studio",
    subtitle: "Schnelles Balancing aller Spiele an einem Ort.",
    steps: [
      { title: "Werte überfliegen", text: "Die Tabelle zeigt die wichtigsten Wirtschafts-Werte aller Spiele (Snake, Plinko, DON, Mine) nebeneinander." },
      { title: "Gegeneinander abstimmen", text: "Credits/Apfel, Tageslimits, Multiplikatoren & Preise vergleichen — so fällt auf, welches Spiel im Verhältnis zu viel ausschüttet." },
      { title: "Klein ändern", text: "In kleinen Schritten anpassen; dieselben Felder lassen sich auch in den einzelnen Games-Tabs feinjustieren." },
    ],
    howItWorks: { heading: "Wichtig: nur eine Überblicks-Ansicht", lines: [
      "Das Balance Studio ist KEIN eigenes System — es schreibt exakt dieselben Werte wie die einzelnen Games-Tabs, nur gebündelt.",
      "Eine Änderung hier wirkt sofort auch im jeweiligen Spiel-Tab und umgekehrt; es gibt keine doppelte Speicherung.",
      "Gedacht als Komfort- und Vergleichsansicht fürs schnelle Quer-Balancing der Inflation.",
    ] },
    blocks: [
      { heading: "Worauf achten", lines: [
        "Credits/Apfel, Tageslimits, Multiplikatoren & Preise beeinflussen direkt die Inflation — kleine Schritte testen.",
        "Detail-Einstellungen pro Spiel findest du weiterhin unter Games.",
      ] },
    ],
    glossary: [
      { term: "Credits/Apfel", def: "Snake-Ausschüttung pro eingesammeltem Apfel — zentraler Inflationstreiber." },
      { term: "Tageslimit", def: "Maximale Credits/Spielzüge pro Tag und Spieler in einem Spiel." },
      { term: "Quer-Balancing", def: "Werte mehrerer Spiele relativ zueinander abstimmen." },
    ],
    tip: "Nach Änderungen ein Spiel real gegentesten — Zahlen wirken oft anders als gedacht.",
  },

  streak: {
    title: "So funktioniert die Daily-Streak",
    subtitle: "Tägliche Login-Belohnung, Meilensteine & Boni.",
    hierarchy: [
      { label: "Abholen", text: "Spieler holt die Tagesbelohnung ab." },
      { label: "Zuwachs", text: "Jeder Tag in Folge erhöht die Belohnung bis zum Max." },
      { label: "Boni", text: "Meilensteine + Wochenende + Events legen oben drauf." },
      { label: "Bruch/Reset", text: "Verpasst (nach Gnadenzeit) → zurück auf Tag 1." },
    ],
    steps: [
      { title: "Basis & Zuwachs setzen", text: "Basis-Belohnung (Tag 1) + täglicher Zuwachs pro Tag in Folge, gedeckelt durch die Max-Belohnung." },
      { title: "Gnadenzeit festlegen", text: "Gnadenzeit-Stunden: wie lange nach Mitternacht noch ohne Streak-Verlust abgeholt werden darf." },
      { title: "Meilensteine konfigurieren", text: "Meilenstein-Intervall (alle N Tage) + Meilenstein-Bonus für einen Extra-Schub an Tag N, 2N, 3N …" },
      { title: "Multiplikatoren", text: "Wochenend-Multiplikator und Spezial-Event-Multiplikator erhöhen die Belohnung in bestimmten Zeiträumen." },
    ],
    howItWorks: { heading: "Wie die Tagesbelohnung berechnet wird", lines: [
      "Belohnung = Basis + Zuwachs × Tage-in-Folge (höchstens Max-Belohnung); danach kommen Meilenstein-Bonus und aktive Multiplikatoren obendrauf.",
      "Die Gnadenzeit verschiebt nur den Stichtag — wird auch sie überschritten, beginnt der Streak wieder bei Tag 1.",
      "Fähigkeiten wirken ZUSÄTZLICH: streak_grace_hours verlängert die Gnadenzeit, streak_reward_multiplier multipliziert die Belohnung.",
    ] },
    blocks: [
      { heading: "Grundlogik", lines: [
        "Basis-Belohnung + täglicher Zuwachs bis zur Max-Belohnung; bricht der Streak, fängt er wieder bei Tag 1 an.",
        "Gnadenzeit (Stunden): wie lange nach Mitternacht noch ohne Streak-Verlust abgeholt werden kann.",
      ] },
    ],
    glossary: [
      { term: "Zuwachs", def: "Wie viel die Belohnung pro Tag in Folge steigt (bis zur Max-Belohnung)." },
      { term: "Gnadenzeit", def: "Stunden nach Mitternacht, in denen ohne Streak-Verlust nachgeholt werden kann." },
      { term: "Meilenstein-Intervall", def: "Alle N Tage gibt es zusätzlich den Meilenstein-Bonus." },
      { term: "Event-Multiplikator", def: "Zeitlich begrenzter Faktor auf die gesamte Belohnung (Wochenende/Spezial-Event)." },
    ],
    tip: "Fähigkeiten können die Gnadenzeit verlängern und die Belohnung multiplizieren (streak_grace_hours / streak_reward_multiplier).",
  },

  shop: {
    title: "So funktioniert der Shop",
    subtitle: "Tages-Rotation + Automatik für ALLE Givable-Typen — idiotensicher.",
    hierarchy: [
      { label: "Automatik", text: "Globale Basis: füllt den Tag bis zur Ziel-Anzahl mit Items." },
      { label: "Kategorien", text: "Pro Kategorie ein Inhalt-Typ + eigene Regeln." },
      { label: "Tagesplan", text: "Wochentag-/Sondertag-Regeln überschreiben Kategorien." },
      { label: "Listing", text: "Ein generierter Eintrag: Item/Fähigkeit/Style/Badge/Gutschein." },
    ],
    steps: [
      { title: "Automatik aktivieren", text: "Ziel-Anzahl Items/Tag + Preisaufschlag min/max + Item-Kategorien für den klassischen globalen Modus." },
      { title: "Kategorie anlegen", text: "+ Neue Kategorie → Details → Inhalt-Typ wählen (Items / Fähigkeiten / Name-Styles / Badges / Gutscheine)." },
      { title: "Regeln setzen", text: "Anzahl/Tag, Seltenheits-Filter, Preis-Multiplikator min/max. Optional Wochentag-/Sondertag-Regeln." },
      { title: "Fertig", text: "Die Automatik zieht ab dem nächsten Shop-Tag automatisch aus dem passenden Pool — kein manuelles Anhaken pro Definition." },
    ],
    howItWorks: { heading: "Wie der Tages-Shop generiert wird", lines: [
      "Einmal pro Shop-Tag: für jede aktive Kategorie wird per Seltenheits-Gewicht die konfigurierte Anzahl aus dem passenden Pool gezogen.",
      "Item-Kategorien ziehen aus dem Item-Katalog; Fähigkeiten/Styles/Badges aus ALLEN enabled Definitionen; Gutschein-Kategorien erzeugen Gratis-Case-Gutscheine mit Seltenheits-Untergrenze.",
      "Preis = Basispreis (oder Seltenheits-Standard) × Kategorie-Multiplikator. Manuell eingetragene Listings bleiben immer erhalten.",
      "Schon heute generiert? Dann greifen Kategorie-Änderungen erst am nächsten Shop-Tag — oder die heutigen Einträge löschen, um sofort neu zu würfeln.",
    ] },
    blocks: [
      { heading: "Kauf & Vergabe", lines: [
        "Items landen im Inventar; Fähigkeit/Style/Badge/Gutschein werden über die zentralen Grants vergeben — ein einheitlicher, atomarer Kaufpfad mit Credits-Rückerstattung bei Fehler.",
      ] },
    ],
    glossary: [
      { term: "Inhalt-Typ", def: "Was eine Kategorie verkauft: Item, Fähigkeit, Name-Style, Badge oder Gutschein." },
      { term: "Ziel-Anzahl", def: "Wie viele Items die globale Automatik pro Tag auffüllt." },
      { term: "Preis-Multiplikator", def: "Aufschlag auf den Basispreis (min–max, zufällig pro Listing)." },
      { term: "Tagesplan-Regel", def: "Überschreibt Anzahl/Seltenheit einer Kategorie an bestimmten Wochentagen/Daten." },
      { term: "Manuelles Listing", def: "Fest eingetragenes Angebot — wird von der Automatik nie überschrieben." },
      { term: "Featured", def: "Mythisch/Ultra-Angebote werden automatisch hervorgehoben." },
    ],
    tip: "Fähigkeiten im Shop: Kategorie mit Inhalt = Fähigkeiten. Gratis-Cases: Inhalt = Gutscheine + Seltenheits-Filter.",
  },

  users: {
    title: "So funktioniert das User-Management",
    subtitle: "Nutzer suchen, Credits/Rollen/Verifizierung/Bans.",
    blocks: [
      { heading: "Suche & Bearbeiten", lines: [
        "Nach Username oder ID suchen, dann pro Nutzer: Credits setzen, Rolle (User/Mod/Admin), verifizieren, Verwarnungen/Bans.",
        "Die Liste aktualisiert sich live bei Änderungen durch andere Admins.",
      ] },
      { heading: "Wichtig", lines: [
        "Sanktionen (Bans/Verwarnungen) laufen über das Mod-Panel; hier sind die direkten Profil-Werte.",
        "Credits-Änderungen werden im Audit-Log protokolliert.",
      ] },
    ],
    glossary: [
      { term: "Rolle", def: "Berechtigungsstufe eines Nutzers: User, Mod oder Admin." },
      { term: "Verifiziert", def: "Bestätigtes Konto-Kennzeichen am Profil." },
      { term: "Verwarnung", def: "Protokollierter Hinweis vor einem Ban (über das Mod-Panel)." },
    ],
  },

  items: {
    title: "So funktioniert der Item-Katalog",
    subtitle: "Werte, Seltenheit und Preise aller Items.",
    steps: [
      { title: "Item anlegen", text: "Name, Typ (Hut/Jacke/Waffe/Schild …), Seltenheit und Preis festlegen." },
      { title: "Kampf-Werte", text: "Bei Kampf-Items zusätzlich Schaden, Rüstung, Perks und Schild-Werte setzen." },
      { title: "Seltenheit prüfen", text: "Die Seltenheit bestimmt die Drop-Gewichte in Cases und Auslosungen." },
    ],
    howItWorks: { heading: "Wo Items auftauchen", lines: [
      "In Cases (Economy & Cases): gewichtet nach Seltenheit.",
      "Im Shop: über die Automatik bzw. die Item-Kategorien.",
      "Als Battle-Pass-Reward auf einzelnen Tiers.",
    ] },
    blocks: [
      { heading: "Pro Item", lines: [
        "Name, Typ (Hut/Jacke/Waffe/Schild …), Seltenheit, Preis. Kampf-Items haben zusätzlich Schaden/Rüstung/Perks/Schild-Werte.",
        "Die Seltenheit bestimmt Drop-Gewichte in Cases und Auslosungen.",
      ] },
    ],
    glossary: [
      { term: "Typ", def: "Slot/Kategorie des Items (Hut, Jacke, Waffe, Schild …)." },
      { term: "Kampf-Item", def: "Item mit Schaden/Rüstung/Perks/Schild für Welt/PvP." },
      { term: "Drop-Gewicht", def: "Aus der Seltenheit abgeleitete Chance in Cases/Auslosungen." },
    ],
  },

  monsters: {
    title: "So funktionieren Monster & Kill-Streak",
    subtitle: "Werte der Welt-Monster + Streak-Belohnung.",
    steps: [
      { title: "Variante einstellen", text: "Pro fester Monster-Variante: Leben, Schaden, Tempo, Reichweite, Belohnung, Spawn-Häufigkeit und Farbe." },
      { title: "Aktiv/Inaktiv", text: "Einzelne Varianten lassen sich deaktivieren; neue Varianten anlegen ist hier bewusst nicht vorgesehen." },
      { title: "Kill-Streak feintunen", text: "Multiplikator pro Kill in Folge + Cap (Obergrenze) festlegen." },
    ],
    howItWorks: { heading: "Wie der Kill-Streak wirkt", lines: [
      "Jeder schnelle Kill in Folge erhöht den Belohnungs-Multiplikator, bis der eingestellte Cap erreicht ist.",
      "Bricht die Kette ab, beginnt der Multiplikator wieder von vorn.",
      "Die Spawn-Häufigkeit steuert, wie viele Monster einer Variante in der Welt erscheinen.",
    ] },
    blocks: [
      { heading: "Monster-Werte", lines: [
        "Pro Variante: Leben, Schaden, Tempo, Reichweite, Belohnung, Spawn-Häufigkeit, Farbe. Varianten lassen sich deaktivieren.",
        "Die Varianten sind fest — neue hinzufügen ist hier bewusst nicht vorgesehen.",
      ] },
    ],
    glossary: [
      { term: "Variante", def: "Fest definierter Monster-Typ mit eigenem Werte-Satz." },
      { term: "Spawn-Häufigkeit", def: "Wie oft eine Variante in der Welt auftaucht." },
      { term: "Kill-Streak-Cap", def: "Obergrenze des Multiplikators für Kills in Folge." },
    ],
  },

  pets: {
    title: "So funktionieren Pets",
    subtitle: "Spezies, Stats und Aggro-Verhalten.",
    blocks: [
      { heading: "Spezies", lines: [
        "Jedes equipte Pet-Item wird per Name einer Spezies zugeordnet (Hund/Katze/Phönix/Drache/Geist, sonst Sonstiges).",
        "Pets greifen Monster im Aggro-Radius eigenständig an — Stats steuern Schaden/Reichweite/Tempo.",
      ] },
    ],
    glossary: [
      { term: "Spezies", def: "Aus dem Pet-Item-Namen abgeleiteter Typ (Hund/Katze/Phönix/Drache/Geist/Sonstiges)." },
      { term: "Aggro-Radius", def: "Reichweite, in der ein Pet Monster selbstständig angreift." },
    ],
  },

  games: {
    title: "So funktionieren die Spiele-Einstellungen",
    subtitle: "Snake, Plinko, DON, Mine, Welt/PvP, Charakter — alle Werte.",
    steps: [
      { title: "Snake", text: "Pro Modus (Classic/Turbo/Grind/Endless): Tempo, Credits/Apfel, Bonus-System, goldener Apfel alle N Äpfel, Tages-CR- und Tages-Spiel-Limit, Theme." },
      { title: "Plinko", text: "Einsatz min/max, Stunden-/Tageslimit, Reihen, Multiplikatoren pro Risiko (Niedrig/Mittel/Hoch), Auto-Bet, Visuals." },
      { title: "DON & Mine", text: "DON: Min/Max-Einsatz, Stunden-/Tageslimit, Cooldown, Gewinnchance, Upgrade-Stufen. Mine: Level-Kurve, CR/Stunde, Lager-Stunden, Upgrade-Kosten." },
      { title: "Welt & Charakter", text: "PvP/Spawn/Session-Regeln, Monster-Spawn-Raten; Charakter: Schaden, Tempo, Sprung, HP-Regen, Rüstung, Perk-Cap." },
    ],
    howItWorks: { heading: "Wichtig: Balance & Hausvorteil", lines: [
      "Bei Plinko zählt Multiplikator × Wahrscheinlichkeit: das Zentrum (k≈6) ist VIEL wahrscheinlicher als die Ränder. Hohe Rand-Multiplikatoren wirken großzügiger als sie sind — RTP immer binomial-gewichtet denken.",
      "Tageslimits/Cooldowns bremsen Inflation. Bonus-Spielzüge (Gutscheine) heben das Limit pro Zug an; Fähigkeiten wirken zusätzlich.",
      "Startseiten-Bestenlisten steuern Reihenfolge, Anzahl und Profilbild-Modus (nur Top 3 oder alle Plätze) der Spielelisten auf der Homepage.",
    ] },
    glossary: [
      { term: "RTP / Hausvorteil", def: "Auszahlungsquote — unter 100 % gewinnt langfristig das Haus." },
      { term: "Tageslimit", def: "Max. Spielzüge/Credits pro Tag und Spieler." },
      { term: "Goldener Apfel", def: "Snake: erscheint exakt alle N normalen Äpfel (pro Modus einstellbar)." },
      { term: "Bonus-Spielzug", def: "Extra-Zug aus einem Gutschein, der über dem normalen Limit greift." },
    ],
    tip: "Nach Balance-Änderungen real gegentesten — gerade Plinko-Multiplikatoren wirken anders als die nackten Zahlen vermuten lassen.",
  },

  branding: {
    title: "So funktioniert das Branding",
    subtitle: "Seitenname, Logo, Währung, Topbar, Startseite.",
    steps: [
      { title: "Identität setzen", text: "Seitenname, Logo/Icon, Währungsname und Versions-Angabe festlegen." },
      { title: "Topbar einrichten", text: "Topbar-Slots (Buttons rechts oben) ein-/ausblenden und ihre Reihenfolge bestimmen." },
      { title: "Startseite gestalten", text: "Startseiten-Karten zusammenstellen und das Ankündigungs-Banner pflegen." },
    ],
    howItWorks: { heading: "Wie es wirkt", lines: [
      "Änderungen betreffen das Erscheinungsbild der ganzen Seite — Name/Logo/Währung erscheinen überall.",
      "Topbar-Slots steuern nur Sichtbarkeit und Reihenfolge vorhandener Buttons — neue Funktionen entstehen dadurch nicht.",
      "Das Ankündigungs-Banner eignet sich für kurze, zeitlich begrenzte Hinweise.",
    ] },
    blocks: [
      { heading: "Inhalte", lines: [
        "Seitenname, Logo/Icon, Währungsname, Version. Topbar-Slots (welche Buttons rechts erscheinen, Reihenfolge).",
        "Startseiten-Karten + Ankündigungs-Banner.",
      ] },
    ],
    glossary: [
      { term: "Topbar-Slot", def: "Ein Button-Platz rechts oben (z.B. Freunde, Gutscheine) — ein-/ausblendbar." },
      { term: "Startseiten-Karte", def: "Eine Kachel auf der Homepage." },
      { term: "Ankündigungs-Banner", def: "Hinweisleiste für kurze, aktuelle Mitteilungen." },
    ],
    tip: "Neue Topbar-Slots (z.B. Freunde, Gutscheine) lassen sich hier ein-/ausblenden und sortieren.",
  },

  audit: {
    title: "So funktioniert das Audit-Log",
    subtitle: "Lückenloser Verlauf aller Admin-Aktionen.",
    blocks: [
      { heading: "Was drin steht", lines: [
        "Jede sicherheitsrelevante Aktion (Credits ändern, Items vergeben, Bans, Käufe, Spiel-Auszahlungen …) mit Akteur + Zeit + Details.",
        "Aktualisiert sich live (Realtime muss für audit_logs in Supabase aktiv sein).",
      ] },
    ],
    glossary: [
      { term: "Akteur", def: "Der Admin/Mod, der die Aktion ausgelöst hat." },
      { term: "Realtime", def: "Live-Aktualisierung des Logs (muss für audit_logs aktiv sein)." },
      { term: "Sicherheitsrelevant", def: "Aktionen wie Credits ändern, Bans, Käufe oder Auszahlungen." },
    ],
  },

  chat: {
    title: "So funktioniert der Chat",
    subtitle: "Globaler Chat: Filter, Limits, Moderation.",
    blocks: [
      { heading: "Steuerung", lines: [
        "Wortfilter, Rate-Limits (Anti-Spam), Nachrichten-Länge, ob der Chat aktiv ist.",
        "Prio-Badges + Name-Styles werden im Chat gerendert.",
      ] },
    ],
    glossary: [
      { term: "Rate-Limit", def: "Anti-Spam-Begrenzung, wie schnell hintereinander gesendet werden darf." },
      { term: "Wortfilter", def: "Liste blockierter/zensierter Begriffe." },
      { term: "Prio-Badge", def: "Badge, das im Chat bevorzugt neben dem Namen erscheint." },
    ],
  },

  homepage_chat: {
    title: "So funktioniert der Startseiten-Chat",
    subtitle: "Chat-Sidebar auf der Homepage.",
    blocks: [
      { heading: "Optionen", lines: [
        "Sichtbarkeit der Sidebar, Standard offen/zu, Glas-Effekt-Intensität.",
        "Nutzt denselben globalen Chat — nur eine kompakte Ansicht auf der Startseite.",
      ] },
    ],
    glossary: [
      { term: "Sidebar", def: "Die kompakte Chat-Leiste auf der Startseite." },
      { term: "Glas-Effekt", def: "Transparenz-/Blur-Intensität der Sidebar." },
    ],
  },

  debug: {
    title: "So funktioniert das Debug-Log",
    subtitle: "Server-Fehler & technische Ereignisse.",
    blocks: [
      { heading: "Nutzen", lines: [
        "Interne Logs (Fehler, Warnungen) zur Fehlersuche — z.B. fehlgeschlagene Grants oder Migrationen.",
      ] },
    ],
    glossary: [
      { term: "Debug-Log", def: "Interne technische Ereignisse (Fehler/Warnungen) zur Fehlersuche." },
      { term: "Grant", def: "Zentrale Vergabe von Items/Fähigkeiten/Badges — fehlgeschlagene tauchen hier auf." },
    ],
  },

  backup: {
    title: "So funktioniert das Backup",
    subtitle: "Daten sichern & wiederherstellen.",
    blocks: [
      { heading: "Ablauf", lines: [
        "Backups erstellen, ansehen und bei Bedarf wiederherstellen.",
        "Vor großen Änderungen (Economy-Reset, Migrationen) ein Backup ziehen.",
      ] },
    ],
    glossary: [
      { term: "Backup", def: "Gesicherter Stand der Daten zu einem Zeitpunkt." },
      { term: "Wiederherstellen", def: "Einen früheren Backup-Stand zurückspielen." },
    ],
  },

  security: {
    title: "So funktioniert die Sicherheit",
    subtitle: "Login-Events, Fingerprints, Device-Bans.",
    blocks: [
      { heading: "Überblick", lines: [
        "Login-Verlauf mit IP/Fingerprint, Erkennung von Mehrfach-Accounts (IP-Duplikate), Geräte-Bans.",
      ] },
    ],
    glossary: [
      { term: "Fingerprint", def: "Geräte-/Browser-Kennung zum Erkennen von Mehrfach-Accounts." },
      { term: "IP-Duplikat", def: "Mehrere Accounts mit gleicher IP — Hinweis auf Multi-Accounts." },
      { term: "Device-Ban", def: "Sperre eines Geräts unabhängig vom Account." },
    ],
  },

  patchnotes: {
    title: "So funktionieren die Patch Notes",
    subtitle: "Changelog + Update-Popup.",
    blocks: [
      { heading: "Erstellen", lines: [
        "Einträge mit Version + Inhalt schreiben. Die Popup-Option blendet das Update beim nächsten Login der Spieler ein.",
      ] },
    ],
    glossary: [
      { term: "Changelog", def: "Chronologische Liste der Versions-Änderungen." },
      { term: "Update-Popup", def: "Einblendung des neuen Eintrags beim nächsten Login der Spieler." },
    ],
  },

  surveys: {
    title: "So funktionieren Umfragen",
    subtitle: "Fragen stellen & auswerten.",
    blocks: [
      { heading: "Ablauf", lines: [
        "Umfrage mit Fragen/Antwortoptionen erstellen; Antworten werden gesammelt und ausgewertet.",
      ] },
    ],
    glossary: [
      { term: "Umfrage", def: "Set aus Fragen mit Antwortoptionen für die Spieler." },
      { term: "Auswertung", def: "Gesammelte Antworten in Übersichtsform." },
    ],
  },

  ki: {
    title: "So funktioniert der KI-Assistent",
    subtitle: "Admin-KI + API-Schlüssel.",
    blocks: [
      { heading: "Setup", lines: [
        "Groq-API-Schlüssel hinterlegen (oder per Env). Danach kannst du im Chat unten Fragen zur Konfiguration/Daten stellen.",
      ] },
    ],
    glossary: [
      { term: "Groq-API-Schlüssel", def: "Zugangsschlüssel für den KI-Dienst (oder per Env hinterlegt)." },
      { term: "Admin-KI", def: "Assistent, der Fragen zur Konfiguration und zu Daten beantwortet." },
    ],
  },

  cleanup: {
    title: "So funktioniert die Verlaufs-Bereinigung",
    subtitle: "Alte Daten automatisch löschen.",
    blocks: [
      { heading: "Regeln", lines: [
        "Pro Datentyp (Logs, Chat, Events …) eine Aufbewahrungsdauer setzen — älteres wird automatisch entfernt.",
        "Hält die Datenbank schlank und schnell.",
      ] },
    ],
    glossary: [
      { term: "Aufbewahrungsdauer", def: "Wie lange ein Datentyp behalten wird, bevor er gelöscht wird." },
      { term: "Datentyp", def: "Kategorie wie Logs, Chat oder Events mit eigener Regel." },
    ],
  },

  badges: {
    title: "So funktionieren Badges",
    subtitle: "Abzeichen definieren, automatisch & manuell vergeben.",
    steps: [
      { title: "Badge definieren", text: "Key (intern), Label, Farbe und Icon festlegen." },
      { title: "Vergabe wählen", text: "Manuell an einzelne Nutzer vergeben ODER automatisch über eine Bedingung (z.B. erreichte Schwelle)." },
      { title: "Anzeige steuern", text: "Prio-Badges werden im Chat bevorzugt neben dem Namen hervorgehoben." },
    ],
    howItWorks: { heading: "Automatik & Rewards", lines: [
      "Automatische Badges werden serverseitig vergeben, sobald ein Nutzer die hinterlegte Bedingung erfüllt — idempotent, also nie doppelt.",
      "Badges lassen sich zusätzlich als Reward in Battle Pass, Cases und Shop einsetzen.",
      "Ein Badge erscheint im Profil und (als Prio-Badge) im Chat.",
    ] },
    blocks: [
      { heading: "Definition & Vergabe", lines: [
        "Badge mit Key/Label/Farbe/Icon anlegen. Manuell an Nutzer vergeben oder automatisch über Bedingungen.",
        "Badges erscheinen im Profil/Chat (Prio-Badges) und als Reward in Battle Pass/Cases/Shop.",
      ] },
    ],
    glossary: [
      { term: "Key", def: "Interner eindeutiger Bezeichner des Badges." },
      { term: "Prio-Badge", def: "Badge, das im Chat bevorzugt neben dem Namen gezeigt wird." },
      { term: "Auto-Vergabe", def: "Badge wird automatisch verliehen, sobald eine Bedingung erfüllt ist." },
    ],
  },

  namestyles: {
    title: "So funktionieren Name-Styles",
    subtitle: "Animierte Namen: Katalog, Seltenheit, Shop, Case-Drops.",
    steps: [
      { title: "Style anlegen", text: "Animation wählen (Shimmer / Rainbow / Glitch …) und Seltenheit festlegen." },
      { title: "Shop-Verfügbarkeit", text: "Pro Style optional: im Shop kaufbar machen mit Preis, Stock (Stückzahl) und Ablaufdatum." },
      { title: "Case-Drops", text: "Pro Seltenheit die Drop-Wahrscheinlichkeit steuern — wie oft Styles dieser Stufe aus Cases fallen." },
    ],
    howItWorks: { heading: "Wo Name-Styles auftauchen", lines: [
      "Im Shop: manuell pro Style (Preis/Stock/Ablauf) ODER automatisch, sobald eine Shop-Kategorie mit Inhalt = Name-Styles existiert.",
      "In Cases: gewichtet nach der Drop-Wahrscheinlichkeit der jeweiligen Seltenheit.",
      "Ein erworbener Style wird über die zentrale Grant-Logik vergeben und ist danach in der Garderobe ausrüstbar.",
    ] },
    blocks: [
      { heading: "Katalog", lines: [
        "Styles (Shimmer/Rainbow/Glitch …) mit Seltenheit. Shop-Verfügbarkeit + Preis + Stock + Ablauf pro Style.",
        "Case-Drop-Wahrscheinlichkeit pro Seltenheit steuert, wie oft sie aus Cases fallen.",
      ] },
    ],
    glossary: [
      { term: "Animation", def: "Visueller Effekt des Namens (Shimmer, Rainbow, Glitch …)." },
      { term: "Stock", def: "Begrenzte Stückzahl eines Styles im Shop." },
      { term: "Drop-Wahrscheinlichkeit", def: "Pro Seltenheit eingestellte Chance, aus einer Case zu fallen." },
    ],
    tip: "Name-Styles erscheinen auch automatisch im Shop, wenn eine Shop-Kategorie mit Inhalt = Name-Styles existiert.",
  },

  level_xp: {
    title: "So funktioniert Level & XP",
    subtitle: "Kurve, XP-Quellen, Level-Belohnungen, Prestige.",
    hierarchy: [
      { label: "Aktion", text: "Spieler tut etwas (Case öffnen, Snake spielen …)." },
      { label: "XP-Quelle", text: "Aktion gibt eine konfigurierte XP-Menge." },
      { label: "Kurve", text: "Gesammelte XP → Level laut benötigter XP pro Stufe." },
      { label: "Belohnung", text: "Jedes Level kann Rewards auslösen." },
    ],
    steps: [
      { title: "XP-Quellen einstellen", text: "Pro Aktion festlegen, wie viel XP sie gibt (Case-Open, Snake-Score-Punkt, Plinko-Drop, Streak-Claim, Welt-Kill, BP-Tier-Claim …)." },
      { title: "Level-Kurve bauen", text: "Pro Level benötigte XP — manuell oder per Bulk-Generator (linear/exponentiell). XP-Kurven-Visualizer zeigt den Verlauf." },
      { title: "Belohnungen vergeben", text: "Pro Level Rewards: Credits / Fähigkeit / Badge / Name-Style. Meilenstein-Level optional mit Celebration." },
      { title: "Prestige aktivieren", text: "Ab Max-Level Reset für permanenten XP-Boost (Bonus-% im Road-Config)." },
    ],
    howItWorks: { heading: "Wie XP verbucht wird (race-sicher)", lines: [
      "XP läuft über eine atomare RPC (increment_xp) — parallele Vergaben verlieren keine XP und vergeben Level-Rewards genau einmal pro überschrittener Grenze.",
      "XP-Multiplikator-Fähigkeiten (xp_boost) + Prestige-Bonus + Synergie-Config multiplizieren die rohe XP.",
      "Prestige-Schutz: ab Prestige > 0 werden Credits-Level-Rewards beim Wiederaufstieg NICHT erneut vergeben (Anti-Farm); Badges/Styles/Fähigkeiten bleiben idempotent.",
    ] },
    glossary: [
      { term: "XP-Quelle", def: "Wie viel XP eine bestimmte Aktion gibt." },
      { term: "Meilenstein-Level", def: "Level mit Sonder-Belohnung/Feier (alle N Level)." },
      { term: "Prestige", def: "Reset ab Max-Level für dauerhaften XP-Boost." },
    ],
    tip: "XP-Boost-Fähigkeiten und die Synergie-Config wirken zusätzlich — bei Balancing beide mitdenken.",
  },

  abilities: {
    title: "So funktionieren Fähigkeiten",
    subtitle: "Effekt-Typen, Werte, Kombo-Effekte, Vergabe & Shop.",
    hierarchy: [
      { label: "Definition", text: "Du legst die Fähigkeit an (Name, Kategorie, Effekt-Typ, Wert)." },
      { label: "Besitz", text: "Spieler bekommt sie (Shop/Battle Pass/Case/Vergabe), optional mit Ablauf." },
      { label: "Ausrüsten", text: "Nur EINE Fähigkeit gleichzeitig aktiv (Garderobe)." },
      { label: "Wirkung", text: "Greift server-seitig im jeweiligen Spiel beim Verdienen/Spielen." },
    ],
    steps: [
      { title: "Effekt-Typ wählen", text: "Gruppiertes Dropdown nach Kategorie (Mine/Snake/Plinko/DON/Welt/Global) — mit Beschreibung + Einheit-Hinweis pro Typ. Kategorie wird automatisch gesetzt." },
      { title: "Wert setzen", text: "Je nach Einheit: Prozent (0.25 = +25 %), Chance (0.25 = 25 %), Wert (z.B. Multiplikator-Untergrenze) oder feste Zahl." },
      { title: "Optional: Kombo", text: "Zusatz-Effekte (effectConfig) als Schlüssel→Zahl bündeln mehrere Wirkungen in EINER Fähigkeit." },
      { title: "Verteilen", text: "Shop-Preis setzen (für Shop-Kategorie) oder direkt an Nutzer vergeben; Seltenheit steuert Drop-Gewichte." },
    ],
    howItWorks: { heading: "Wie der Effekt im Spiel greift", lines: [
      "Jedes Spiel liest beim Verdienen die EINE ausgerüstete Fähigkeit (getActiveEquippedAbilityEffect) und wendet sie an.",
      "Fähigkeiten sind sich gegenseitig ausschließend — es ist immer nur eine aktiv, daher keine Stapelung.",
      "Beispiele: case_luck (Chance, dass ein Case-Drop eine Seltenheit höher ausfällt), plinko_min_multiplier (garantierter Mindest-Multiplikator), mine_jackpot_chance (3×-Abholung), snake_score_multiplier, don_loss_refund, streak_reward_multiplier.",
    ] },
    glossary: [
      { term: "Effekt-Typ", def: "WAS die Fähigkeit tut (z.B. plinko_min_multiplier) — Single-Source mit Label/Beschreibung/Einheit." },
      { term: "Effekt-Wert", def: "WIE STARK — Bedeutung hängt von der Einheit ab (Prozent/Chance/Wert/Flat)." },
      { term: "effectConfig", def: "Kombo-Zusatz: mehrere Effekte in einer Fähigkeit (Schlüssel→Zahl)." },
      { term: "Seltenheit", def: "Selten/Mythisch/Ultra — Farbe + Drop-Gewicht in Cases/Shop." },
      { term: "Ablauf (expires_at)", def: "Zeitlich begrenzte Fähigkeit (z.B. aus einem Gutschein/Shop-Deal)." },
    ],
    tip: "Fähigkeiten kommen automatisch in den Shop, sobald eine Shop-Kategorie mit Inhalt = Fähigkeiten existiert — kein Extra-Haken pro Fähigkeit nötig.",
  },

  vouchers: {
    title: "So funktionieren Gutschein-Codes",
    subtitle: "Einlösbare Codes, Bulk-Giveaways & Direkt-Vergabe.",
    steps: [
      { title: "Belohnungs-Bündel wählen", text: "Was der Code enthält: Credits, Fähigkeit, Badge und/oder Name-Style — beliebig kombinierbar." },
      { title: "Limits setzen", text: "Max. Einlösungen gesamt, pro-User-Limit, optional Ziel-User (nur bestimmte Spieler), Start- und Ablaufzeit." },
      { title: "Code oder Bulk", text: "Einen einzelnen Code vergeben ODER per Bulk-Generator viele Einzel-Codes mit demselben Inhalt für Giveaways erzeugen." },
      { title: "Direkt-Vergabe", text: "Belohnung ganz ohne Code direkt an ausgewählte Spieler geben (Kompensation/Geschenke)." },
    ],
    howItWorks: { heading: "Wie das Einlösen abläuft", lines: [
      "Beim Einlösen wird das komplette Bündel atomar vergeben; Limits (gesamt + pro User) werden serverseitig geprüft, Doppel-Einlösung ist ausgeschlossen.",
      "Abgelaufene, ausgeschöpfte oder noch nicht gestartete Codes werden abgelehnt.",
      "WICHTIG: Case-/Spiel-Bonus-Gutscheine laufen NICHT über dieses Code-System, sondern über Battle Pass, Cases & Shop.",
    ] },
    blocks: [
      { heading: "Codes", lines: [
        "Code mit Belohnungs-Bündel (Credits/Fähigkeit/Badge/Name-Style) erstellen. Optionen: max. Einlösungen, pro-User-Limit, Ziel-User, Start/Ablauf.",
        "Bulk-Generator erzeugt viele Einzel-Codes mit demselben Inhalt (Giveaways).",
      ] },
      { heading: "Direkt-Vergabe", lines: [
        "Belohnungen ohne Code direkt an ausgewählte Spieler geben (Kompensation/Geschenke).",
      ] },
    ],
    glossary: [
      { term: "Belohnungs-Bündel", def: "Inhalt eines Codes: Credits / Fähigkeit / Badge / Name-Style (kombinierbar)." },
      { term: "Pro-User-Limit", def: "Wie oft ein einzelner Spieler denselben Code einlösen darf." },
      { term: "Ziel-User", def: "Optionale Einschränkung: nur bestimmte Spieler dürfen einlösen." },
      { term: "Bulk-Generator", def: "Erzeugt viele Einzel-Codes mit identischem Inhalt für Giveaways." },
    ],
    tip: "Case-/Spiel-Bonus-Gutscheine werden NICHT hier per Code verteilt, sondern über Battle Pass, Cases & Shop.",
  },

  sounds: {
    title: "So funktioniert der Sound Manager",
    subtitle: "Sound-Events & Lautstärken.",
    blocks: [
      { heading: "Steuerung", lines: [
        "Pro Event (Klick, Gewinn, Level-Up …) Datei + Lautstärke. Master-Lautstärke global.",
      ] },
    ],
    glossary: [
      { term: "Sound-Event", def: "Auslöser für einen Klang (Klick, Gewinn, Level-Up …)." },
      { term: "Master-Lautstärke", def: "Globaler Regler über alle Sounds." },
    ],
  },

  music: {
    title: "So funktioniert die Hintergrundmusik",
    subtitle: "BGM pro Seite + Track-Bibliothek.",
    blocks: [
      { heading: "Zuweisung", lines: [
        "Pro Seite/Bereich einen Track zuweisen; Fades + Lautstärke. In Snake kann die Musik mit dem Spieltempo dynamisch beschleunigen.",
      ] },
    ],
    glossary: [
      { term: "BGM", def: "Hintergrundmusik (Background Music) pro Seite/Bereich." },
      { term: "Fade", def: "Sanftes Ein-/Ausblenden beim Track-Wechsel." },
      { term: "Dynamisches Tempo", def: "In Snake beschleunigt die Musik mit dem Spieltempo." },
    ],
  },

  theme: {
    title: "So funktioniert das Theming",
    subtitle: "Gesamt-Design der Seite.",
    blocks: [
      { heading: "Designs", lines: [
        "Seitenweites Farb-/Glow-Design wählen (Presets wie Neon/Cyber/Matrix) mit Live-Vorschau. Akzentfarben anpassbar.",
      ] },
    ],
    glossary: [
      { term: "Preset", def: "Vordefiniertes Farb-/Glow-Design (z.B. Neon, Cyber, Matrix)." },
      { term: "Akzentfarbe", def: "Hervorhebungsfarbe des Designs." },
    ],
  },

  preview_config: {
    title: "So funktioniert die Preview-Engine",
    subtitle: "3D-Vorschau für Items, Badges, Styles, Givables.",
    blocks: [
      { heading: "Einstellungen", lines: [
        "Pro Subjekt-Typ: Rotation, Zoom, Partikel, Glow. Steuert, wie Vorschauen in Shop/Cases/Battle-Pass/Garderobe gerendert werden.",
      ] },
    ],
    glossary: [
      { term: "Subjekt-Typ", def: "Was vorab gezeigt wird: Item, Badge, Style oder Givable." },
      { term: "Givable", def: "Alles Vergebbare (Item/Fähigkeit/Style/Badge) in der Vorschau." },
    ],
  },

  fine_config: {
    title: "So funktioniert das Feintuning",
    subtitle: "Feingranulare technische Werte — für Profis.",
    steps: [
      { title: "Nametags", text: "Höhe über dem Charakter und Schriftgröße der Namensschilder." },
      { title: "Multiplayer-Sync", text: "Lerp-Glättung, Dead-Reckoning (Bewegungs-Vorhersage) und Polling-Intervall für die Positions-Synchronisation." },
      { title: "Effekte & Limits", text: "Hit-Effekte (Blut/Partikel), Chat-Polling-Intervall und diverse technische Limits." },
    ],
    howItWorks: { heading: "Wichtig vor dem Drehen", lines: [
      "Die Standardwerte sind in den meisten Fällen gut — nur ändern, wenn ein konkretes Problem vorliegt.",
      "Sync-Werte sind ein Kompromiss: mehr Glättung wirkt flüssiger, erhöht aber die wahrgenommene Verzögerung.",
      "Kleine Schritte testen und live im Spiel gegenprüfen.",
    ] },
    blocks: [
      { heading: "Bereiche", lines: [
        "Nametags (Höhe/Größe), Multiplayer-Sync (Lerp/Dead-Reckoning/Polling), Hit-Effekte (Blut/Partikel), Chat-Polling, Limits.",
        "Für Profis — Standardwerte sind meist gut; kleine Änderungen testen.",
      ] },
    ],
    glossary: [
      { term: "Lerp", def: "Lineare Glättung zwischen Positions-Updates für flüssige Bewegung." },
      { term: "Dead-Reckoning", def: "Vorhersage der nächsten Position aus der letzten Bewegung." },
      { term: "Polling-Intervall", def: "Wie oft Positionen/Chat vom Server abgefragt werden." },
    ],
    tip: "Im Zweifel auf Standard lassen — diese Werte betreffen Gefühl und Performance, nicht die Wirtschaft.",
  },

  daily_quests: {
    title: "So funktionieren Daily Quests",
    subtitle: "Tägliche Aufgaben für alle Spieler — Vorlagen, Ziele, Rewards.",
    hierarchy: [
      { label: "Vorlage", text: "Du definierst eine Quest (Aktion, Ziel, Belohnung)." },
      { label: "Auswahl", text: "Jeder Spieler bekommt täglich eine zufällige Auswahl." },
      { label: "Fortschritt", text: "Aktionen zählen automatisch hoch." },
      { label: "Abholen", text: "Bei Ziel erreicht → Belohnung claimbar." },
    ],
    steps: [
      { title: "Vorlage anlegen", text: "Ziel-Aktion wählen (Cases öffnen, Snake spielen, Plinko-Drops, Login …), Zielwert, Schwierigkeit (easy/medium/hard/legendary)." },
      { title: "Belohnung festlegen", text: "Reward-Typ: Credits / XP / Battle-Pass-XP / Item (oder gemischt). Credits skalieren mit Spieler-Level." },
      { title: "Config", text: "Wie viele Quests pro Tag, Reset-Zeitpunkt (UTC-Mitternacht), Schwierigkeits-Mix." },
    ],
    howItWorks: { heading: "Fortschritt & Reset", lines: [
      "Aktionen im Spiel erhöhen den Quest-Zähler automatisch (z.B. incrementDailyQuestProgress beim Case-Open).",
      "Belohnung ist erst nach Zielerreichung abholbar; das Abholen ist atomar (kein Doppel-Claim).",
      "Reset um UTC-Mitternacht: jeder Spieler bekommt eine frische Auswahl.",
    ] },
    glossary: [
      { term: "Ziel-Aktion", def: "Was zählt (Cases öffnen, Snake spielen …)." },
      { term: "Schwierigkeit", def: "easy/medium/hard/legendary — höhere Stufe, höhere Belohnung." },
      { term: "BP-XP", def: "Battle-Pass-Fortschritt als Quest-Belohnung." },
    ],
  },

  synergy: {
    title: "So funktionieren Synergie & Boosts",
    subtitle: "Systeme verbinden + zeitbasierte globale Boosts.",
    steps: [
      { title: "Querfluss einstellen", text: "Wie stark Level/Battle-Pass/Quests ineinandergreifen — z.B. wie viel BP-XP ein Level-Up automatisch mitgibt." },
      { title: "Zeit-Boosts definieren", text: "Wochenende / Happy Hour / Events: in bestimmten Zeiträumen Credits oder XP global multiplizieren." },
      { title: "Level-Staffelung", text: "Skalierung nach Spieler-Level — höhere Level bekommen mehr/weniger, feinjustierbar." },
    ],
    howItWorks: { heading: "Wie die Boosts zusammenwirken", lines: [
      "Die Synergie-Multiplikatoren greifen ZUSÄTZLICH zu Fähigkeiten und Prestige — alle Faktoren multiplizieren sich.",
      "Zeit-Boosts sind global (alle Spieler) und nur im definierten Fenster aktiv.",
      "Vorsicht: mehrere gleichzeitige Boosts können die Inflation schnell hochtreiben — Gesamtwirkung testen.",
    ] },
    glossary: [
      { term: "Querfluss", def: "Automatischer XP-Übertrag zwischen Level/BP/Quests." },
      { term: "Happy Hour", def: "Zeitfenster mit erhöhten Credits/XP." },
      { term: "Level-Staffelung", def: "Boost-Stärke abhängig vom Spieler-Level." },
    ],
  },

  friends: {
    title: "So funktioniert das Freunde-System",
    subtitle: "Read-only Übersicht: Statistik, Anfragen-Verlauf, Blockierungen.",
    hierarchy: [
      { label: "Anfrage", text: "Ein Spieler schickt einem anderen eine Freundschaftsanfrage." },
      { label: "Antwort", text: "Der Empfänger nimmt an oder lehnt ab; der Absender kann zurückziehen." },
      { label: "Freundschaft", text: "Bei Annahme entsteht eine beidseitige Freundschaft." },
      { label: "Blockieren", text: "Ein Spieler kann einen anderen blockieren — beendet Freundschaft + Anfragen." },
    ],
    howItWorks: { heading: "Datenmodell in einem Satz", lines: [
      "friend_requests speichert jede Anfrage mit Status (pending, accepted, declined, cancelled) plus Zeitstempel.",
      "friendships hat zwei Zeilen pro Freundschaft (eine je Richtung) — die Statistik teilt die Zeilenzahl daher durch 2.",
      "blocked_users haelt jede Blockierung als blocker zu blocked; Blockieren loescht Freundschaft und offene Anfragen.",
    ] },
    blocks: [
      { heading: "Was dieser Tab zeigt", lines: [
        "Drei Kennzahlen: aktive Freundschaften, offene Anfragen, aktive Blockierungen.",
        "Anfragen-Verlauf: die letzten Anfragen mit Von, An, Status und Zeit.",
        "Blockierungen: wer wen blockiert hat, mit Zeit.",
        "Reine Lese-Ansicht — hier wird nichts veraendert; das Freunde-System steuern die Spieler selbst im Overlay.",
      ] },
    ],
    glossary: [
      { term: "Anfrage-Status", def: "pending (offen), accepted (angenommen), declined (abgelehnt), cancelled (zurueckgezogen)." },
      { term: "Beidseitig", def: "Eine Freundschaft wird als zwei Zeilen gespeichert, je eine pro Richtung." },
      { term: "Blockierung", def: "Beendet Freundschaft und offene Anfragen und verhindert neue Anfragen." },
    ],
  },
};
