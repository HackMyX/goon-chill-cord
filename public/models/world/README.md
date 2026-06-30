# Welt-3D-Modelle (GLTF/GLB) — Drop-in

Echte 3D-Modelle für die Post-Apokalypse-Welt. Hier liegen die GLB-Dateien, die die
prozeduralen Primitive ersetzen. **Alles ist optional** — fehlt eine Datei, rendert
der jeweilige Kind weiter prozedural (kein Crash).

## So fügst du ein Modell hinzu (kein Code außer 1 Zeile Registry)

1. **Besorge ein CC0-GLB** (lizenzfrei, kommerziell nutzbar ohne Namensnennung):
   - poly.pizza (Quaternius-Packs „Survival Pack", „Cars Bundle" → Button **Download GLTF**)
   - kaylousberg.itch.io (KayKit, CC0) · kenney.nl (CC0) · polyhaven.com (CC0)
   - Bevorzuge **Low-Poly, ein Material/Atlas, < ~300 KB**, damit Mobile flüssig bleibt.
2. **Lege die Datei hier ab**, z.B. `wreck.glb`, `dead_tree.glb`, `ruin.glb`.
3. **Aktiviere sie** in `lib/world-models.ts` → `WORLD_MODEL_REGISTRY`:
   ```ts
   wreck: { url: "/models/world/wreck.glb", scale: 1, yOffset: 0, yawOffset: 0 },
   ```
   - `scale`: füllt das Modell die bestehende Kollisionsbox? (sonst anpassen)
   - `yOffset`: sitzt der Modell-Ursprung nicht auf dem Boden? → hochschieben
   - `yawOffset`: schaut das Modell in die falsche Richtung? → drehen (Radiant)

Danach: committen → Redeploy → Strg+Shift+R. Der Render-Switch, Frustum-Culling und
der Suspense-Fallback laufen automatisch (`components/world/world-model-instances.tsx`).

## Wichtig

- **Kollision/Navigation bleiben unberührt.** Das Modell ist NUR Optik; die
  Kollisionsform kommt weiter aus dem Obstacle-Record. `scale`/`yOffset` so wählen,
  dass Optik und Kollisionsbox zusammenpassen (sonst „läuft ins Modell" / „kollidiert
  mit Luft"). `blockH`/`hx`/`hz` werden hier NICHT geändert.
- **Determinismus/Multiplayer:** Modelle ändern nur das Rendering, nicht die seeded
  Geometrie → kein Multiplayer-Risiko.
- **Austauschbare Kinds:** tree, rock, ruin, wreck, debris, crate, lamp, campfire.
  Strukturelle (wall, roof, road, monument) bleiben prozedural.
- **Draco/Meshopt-komprimierte GLBs** brauchen ggf. einen Decoder — im Zweifel
  unkomprimiert exportieren.
- **Lizenz:** Nur CC0 / explizit kommerziell-frei. Quelle/Lizenz pro Datei am besten
  in dieser README notieren.

## Aktuell abgelegte Modelle

_(noch keine — Registry leer, alles prozedural)_
