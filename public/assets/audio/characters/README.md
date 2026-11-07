# Filmi Dangal — Character-Specific Audio Drop-In Guide

Drop character-specific `.mp3`, `.ogg`, or `.wav` sound effects into the character folders below:

```
public/assets/audio/characters/
  action-sultan/
    supershot-charge.mp3
    supershot-release.mp3
    supershot-impact.mp3
    supermove-charge.mp3
    supermove-impact.mp3
    normal-attack.mp3
    hit-react.mp3
    victory.mp3
    defeat.mp3
  romance-raja/
    supershot-charge.mp3
    supershot-release.mp3
    supershot-impact.mp3
    supermove-charge.mp3
    supermove-impact.mp3
    normal-attack.mp3
    hit-react.mp3
    victory.mp3
    defeat.mp3
  dance-dynamo/
    supershot-charge.mp3
    supershot-release.mp3
    supershot-impact.mp3
    supermove-charge.mp3
    supermove-impact.mp3
    normal-attack.mp3
    hit-react.mp3
    victory.mp3
    defeat.mp3
  villain-saab/
    supershot-charge.mp3
    supershot-release.mp3
    supershot-impact.mp3
    supermove-charge.mp3
    supermove-impact.mp3
    normal-attack.mp3
    hit-react.mp3
    victory.mp3
    defeat.mp3
```

## Automatic Fallback Behavior
`AudioManager` automatically attempts to load and play the configured audio file from `src/config/audioAssets.ts`. If an external audio file is not yet placed in `public/assets/audio/characters/<slug>/`, `AudioManager` logs a structured warning once and synthesizes a distinct character-specific Web Audio sound effect so gameplay never crashes or goes silent.
