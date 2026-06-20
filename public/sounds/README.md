Drop the sound effect files here:

- `tick.mp3` — reel passing an item during a spin (fires rapidly, must be short/punchy)
- `win.mp3` — case win at Normal/Selten/Mythisch rarity
- `ultra-win.mp3` — case win at Ultra rarity (plays together with the confetti burst)
- `click.mp3` — generic UI feedback (case buttons, wardrobe filters, Anlegen/Ablegen)
- `error.mp3` — failed action (not enough credits, etc.)
- `flip.mp3` — Double-or-Nothing flip start
- `hover.mp3` — subtle hover feedback on buttons/icons/nav (fires often, keep it quiet and very short, <100ms)

Until these files exist, playback fails silently (handled in `lib/sound-manager.ts`), so the UI keeps working without them.
