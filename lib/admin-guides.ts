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
  blocks: AdminGuideBlock[];
  tip?: string;
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
    subtitle: "Tages-Rotation + Automatik für ALLE Givable-Typen.",
    blocks: [
      { heading: "Automatik (oben)", lines: [
        "Füllt jeden Tag bis zur Ziel-Anzahl mit zufälligen Items aus den gewählten Item-Kategorien. Manuell hinzugefügte Listings bleiben unangetastet.",
        "Generiert einmal pro Shop-Tag — Änderungen greifen am nächsten Tag (oder heutige Einträge löschen).",
      ] },
      { heading: "Kategorien & Tagesplan", lines: [
        "Jede Kategorie hat einen INHALT-Typ: Items, Fähigkeiten, Name-Styles, Badges oder Gutscheine — die Automatik zieht automatisch aus dem passenden Pool. KEIN manuelles Im-Shop-verfügbar-Anhaken pro Definition nötig.",
        "Pro Kategorie: Anzahl/Tag, Seltenheits-Filter, Preis-Multiplikator. Wochentag-/Sondertag-Regeln überschreiben das für einzelne Tage.",
        "Gutschein-Kategorien erzeugen Gratis-Case-Gutscheine nach Seltenheit.",
      ] },
      { heading: "Kauf", lines: [
        "Items landen im Inventar, alles andere wird über die zentralen Grants vergeben (Fähigkeit/Style/Badge/Gutschein) — ein einheitlicher Kaufpfad.",
      ] },
    ],
    tip: "Für Fähigkeiten im Shop: + Neue Kategorie → Details → Inhalt = Fähigkeiten → Anzahl + Seltenheit.",
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
    subtitle: "Snake, Plinko, DON, Mine, Welt/PvP, Charakter.",
    blocks: [
      { heading: "Pro Spiel", lines: [
        "Snake: pro Modus Tempo, Credits/Apfel, Bonus-System, goldener Apfel (alle N Äpfel), Tageslimits.",
        "Plinko: Einsatz-Limits, Stunden-/Tageslimit, Reihen + Multiplikatoren pro Risiko (RTP beachten!).",
        "DON: Flip-Limits + Cooldown. Mine: Level-Kurve, Rate, Lager. Welt/PvP & Charakter: Combat-Werte.",
      ] },
      { heading: "Wichtig", lines: [
        "Bei Plinko bestimmen die Multiplikatoren × Wahrscheinlichkeiten den Hausvorteil — Zentrum ist viel wahrscheinlicher als die Ränder.",
        "Startseiten-Bestenlisten: Reihenfolge/Limit/Profilbild-Modus der Spielelisten.",
      ] },
    ],
    tip: "Bonus-Spielzüge (Gutscheine) heben das Limit pro Zug an; Fähigkeiten wirken zusätzlich.",
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
    subtitle: "Level-Kurve, XP-Quellen, Belohnungen, Prestige.",
    blocks: [
      { heading: "Kurve & Quellen", lines: [
        "Pro Level: benötigte XP + Belohnungen (Credits/Fähigkeit/Badge/Name-Style). Bulk-Generator + XP-Kurven-Visualizer.",
        "XP-Quellen: wie viel XP jede Aktion gibt (Case öffnen, Snake-Score, Plinko-Drop, Streak, Welt-Kill …).",
      ] },
      { heading: "Prestige", lines: [
        "Ab Max-Level zurücksetzen für permanenten XP-Boost. Credits-Rewards werden beim Wiederaufstieg nicht erneut vergeben (Anti-Farm).",
      ] },
    ],
    tip: "XP-Multiplikator-Fähigkeiten (xp_boost) und die Synergie-Config beeinflussen die XP zusätzlich.",
  },

  abilities: {
    title: "So funktionieren Fähigkeiten",
    subtitle: "Effekt-Typen, Werte, Kombo-Effekte, Shop/Vergabe.",
    blocks: [
      { heading: "Anlegen", lines: [
        "Key/Name/Icon, Kategorie + Effekt-Typ (gruppiert mit Beschreibung + Einheit-Hinweis), Wert, Seltenheit, Shop-Preis.",
        "Nur EINE Fähigkeit ist gleichzeitig ausgerüstet; sie wirkt server-seitig im jeweiligen Spiel.",
      ] },
      { heading: "Effekt-Wert lesen", lines: [
        "Prozent: 0.25 = +25 %. Chance: 0.25 = 25 %. Wert: z.B. Multiplikator-Untergrenze. Flat: feste Zahl.",
        "Beispiele: case_luck (Chance auf bessere Seltenheit), plinko_min_multiplier (Mindest-Multiplikator), mine_jackpot_chance.",
      ] },
      { heading: "Kombo (effectConfig)", lines: [
        "Optionale Zusatz-Werte als Schlüssel→Zahl bündeln mehrere Effekte in EINER Fähigkeit (z.B. Mine: double_chance + upgrade_discount).",
      ] },
    ],
    tip: "Fähigkeiten kommen automatisch in den Shop, wenn eine Shop-Kategorie mit Inhalt = Fähigkeiten existiert — kein Extra-Haken nötig.",
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
    subtitle: "Systeme verbinden + Zeit-Boosts.",
    blocks: [
      { heading: "Querfluss", lines: [
        "Steuert, wie Level/Battle-Pass/Quests ineinandergreifen (z.B. wie viel BP-XP ein Level-Up gibt).",
        "Zeit-Boosts: Wochenende / Happy Hour / Events erhöhen Credits oder XP global in Zeiträumen.",
      ] },
      { heading: "Skalierung", lines: [
        "Level-Staffelung: höhere Level können mehr/weniger bekommen — feinjustierbar.",
      ] },
    ],
  },
};
