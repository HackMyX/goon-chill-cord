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
    blocks: [
      { heading: "Was es ist", lines: [
        "Eine kompakte Tabelle mit den wichtigsten Wirtschafts-Werten aller Spiele (Snake, Plinko, DON, Mine) zum schnellen Gegeneinander-Abstimmen.",
        "Ändert dieselben Werte wie die einzelnen Spiel-Tabs (Games) — nur gebündelt für den Überblick.",
      ] },
      { heading: "Worauf achten", lines: [
        "Credits/Apfel, Tageslimits, Multiplikatoren & Preise beeinflussen direkt die Inflation — kleine Schritte testen.",
        "Detail-Einstellungen pro Spiel findest du weiterhin unter Games.",
      ] },
    ],
    tip: "Nach Änderungen ein Spiel real gegentesten — Zahlen wirken oft anders als gedacht.",
  },

  streak: {
    title: "So funktioniert die Daily-Streak",
    subtitle: "Tägliche Login-Belohnung, Meilensteine & Boni.",
    blocks: [
      { heading: "Grundlogik", lines: [
        "Basis-Belohnung + täglicher Zuwachs bis zur Max-Belohnung; bricht der Streak, fängt er wieder bei Tag 1 an.",
        "Gnadenzeit (Stunden): wie lange nach Mitternacht noch ohne Streak-Verlust abgeholt werden kann.",
      ] },
      { heading: "Extras", lines: [
        "Meilenstein-Intervall + Bonus: alle N Tage gibt's einen Extra-Schub.",
        "Wochenend-Multiplikator & Spezial-Event-Multiplikator erhöhen die Belohnung in bestimmten Zeiträumen.",
      ] },
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
  },

  items: {
    title: "So funktioniert der Item-Katalog",
    subtitle: "Werte, Seltenheit und Preise aller Items.",
    blocks: [
      { heading: "Pro Item", lines: [
        "Name, Typ (Hut/Jacke/Waffe/Schild …), Seltenheit, Preis. Kampf-Items haben zusätzlich Schaden/Rüstung/Perks/Schild-Werte.",
        "Die Seltenheit bestimmt Drop-Gewichte in Cases und Auslosungen.",
      ] },
      { heading: "Verbindung", lines: [
        "Items erscheinen in Cases (Economy & Cases), im Shop (Automatik/Kategorien) und als Battle-Pass-Reward.",
      ] },
    ],
  },

  monsters: {
    title: "So funktionieren Monster & Kill-Streak",
    subtitle: "Werte der Welt-Monster + Streak-Belohnung.",
    blocks: [
      { heading: "Monster-Werte", lines: [
        "Pro Variante: Leben, Schaden, Tempo, Reichweite, Belohnung, Spawn-Häufigkeit, Farbe. Varianten lassen sich deaktivieren.",
        "Die Varianten sind fest — neue hinzufügen ist hier bewusst nicht vorgesehen.",
      ] },
      { heading: "Kill-Streak", lines: [
        "Multiplikator pro Kill in Folge + Cap. Steuert, wie stark schnelles Kettenfarmen belohnt wird.",
      ] },
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
    subtitle: "Seitenname, Logo, Topbar, Startseite.",
    blocks: [
      { heading: "Inhalte", lines: [
        "Seitenname, Logo/Icon, Währungsname, Version. Topbar-Slots (welche Buttons rechts erscheinen, Reihenfolge).",
        "Startseiten-Karten + Ankündigungs-Banner.",
      ] },
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
  },

  debug: {
    title: "So funktioniert das Debug-Log",
    subtitle: "Server-Fehler & technische Ereignisse.",
    blocks: [
      { heading: "Nutzen", lines: [
        "Interne Logs (Fehler, Warnungen) zur Fehlersuche — z.B. fehlgeschlagene Grants oder Migrationen.",
      ] },
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
  },

  security: {
    title: "So funktioniert die Sicherheit",
    subtitle: "Login-Events, Fingerprints, Device-Bans.",
    blocks: [
      { heading: "Überblick", lines: [
        "Login-Verlauf mit IP/Fingerprint, Erkennung von Mehrfach-Accounts (IP-Duplikate), Geräte-Bans.",
      ] },
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
  },

  surveys: {
    title: "So funktionieren Umfragen",
    subtitle: "Fragen stellen & auswerten.",
    blocks: [
      { heading: "Ablauf", lines: [
        "Umfrage mit Fragen/Antwortoptionen erstellen; Antworten werden gesammelt und ausgewertet.",
      ] },
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
  },

  badges: {
    title: "So funktionieren Badges",
    subtitle: "Abzeichen definieren & vergeben.",
    blocks: [
      { heading: "Definition & Vergabe", lines: [
        "Badge mit Key/Label/Farbe/Icon anlegen. Manuell an Nutzer vergeben oder automatisch über Bedingungen.",
        "Badges erscheinen im Profil/Chat (Prio-Badges) und als Reward in Battle Pass/Cases/Shop.",
      ] },
    ],
  },

  namestyles: {
    title: "So funktionieren Name-Styles",
    subtitle: "Animierte Namen: Katalog, Shop, Case-Drops.",
    blocks: [
      { heading: "Katalog", lines: [
        "Styles (Shimmer/Rainbow/Glitch …) mit Seltenheit. Shop-Verfügbarkeit + Preis + Stock + Ablauf pro Style.",
        "Case-Drop-Wahrscheinlichkeit pro Seltenheit steuert, wie oft sie aus Cases fallen.",
      ] },
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
    subtitle: "Einlösbare Codes + Direkt-Vergabe.",
    blocks: [
      { heading: "Codes", lines: [
        "Code mit Belohnungs-Bündel (Credits/Fähigkeit/Badge/Name-Style) erstellen. Optionen: max. Einlösungen, pro-User-Limit, Ziel-User, Start/Ablauf.",
        "Bulk-Generator erzeugt viele Einzel-Codes mit demselben Inhalt (Giveaways).",
      ] },
      { heading: "Direkt-Vergabe", lines: [
        "Belohnungen ohne Code direkt an ausgewählte Spieler geben (Kompensation/Geschenke).",
      ] },
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
  },

  music: {
    title: "So funktioniert die Hintergrundmusik",
    subtitle: "BGM pro Seite + Track-Bibliothek.",
    blocks: [
      { heading: "Zuweisung", lines: [
        "Pro Seite/Bereich einen Track zuweisen; Fades + Lautstärke. In Snake kann die Musik mit dem Spieltempo dynamisch beschleunigen.",
      ] },
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
  },

  preview_config: {
    title: "So funktioniert die Preview-Engine",
    subtitle: "3D-Vorschau für Items, Badges, Styles, Givables.",
    blocks: [
      { heading: "Einstellungen", lines: [
        "Pro Subjekt-Typ: Rotation, Zoom, Partikel, Glow. Steuert, wie Vorschauen in Shop/Cases/Battle-Pass/Garderobe gerendert werden.",
      ] },
    ],
  },

  fine_config: {
    title: "So funktioniert das Feintuning",
    subtitle: "Feingranulare technische Werte.",
    blocks: [
      { heading: "Bereiche", lines: [
        "Nametags (Höhe/Größe), Multiplayer-Sync (Lerp/Dead-Reckoning/Polling), Hit-Effekte (Blut/Partikel), Chat-Polling, Limits.",
        "Für Profis — Standardwerte sind meist gut; kleine Änderungen testen.",
      ] },
    ],
  },

  daily_quests: {
    title: "So funktionieren Daily Quests",
    subtitle: "Tägliche Aufgaben für alle Spieler.",
    blocks: [
      { heading: "Vorlagen", lines: [
        "Quest-Vorlagen mit Ziel-Aktion (Cases öffnen, Snake spielen, Plinko-Drops …), Zielwert, Schwierigkeit und Belohnung (Credits/XP/BP-XP/Item).",
        "Jeder Spieler bekommt täglich eine Auswahl; Reset um Mitternacht (UTC).",
      ] },
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
};
