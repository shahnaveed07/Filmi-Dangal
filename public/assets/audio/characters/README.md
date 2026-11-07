# Filmi Dangal — Character-Specific Audio Drop-In Guide

Drop character-specific `.ogg` or `.mp3` sound effects into the character folders below:

```
public/assets/audio/characters/
  action-sultan/
    supershot-charge.ogg
    supershot-release.ogg
    supershot-impact.ogg
    supermove-charge.ogg
    supermove-impact.ogg
    normal-attack.ogg
    hit-react.ogg
    victory.ogg
    defeat.ogg
  romance-raja/
    supershot-charge.ogg
    supershot-release.ogg
    supershot-impact.ogg
    supermove-charge.ogg
    supermove-impact.ogg
    normal-attack.ogg
    hit-react.ogg
    victory.ogg
    defeat.ogg
  duggu/
    supershot-charge.ogg
    supershot-release.ogg
    supershot-impact.ogg
    supermove-charge.ogg
    supermove-impact.ogg
    normal-attack.ogg
    hit-react.ogg
    victory.ogg
    defeat.ogg
  bhidu/
    supershot-charge.ogg
    supershot-release.ogg
    supershot-impact.ogg
    supermove-charge.ogg
    supermove-impact.ogg
    normal-attack.ogg
    hit-react.ogg
    victory.ogg
    defeat.ogg
```

## Automatic Fallback Behavior
`AudioManager` automatically attempts to load and play the configured `.ogg` or `.mp3` audio file from `src/config/audioAssets.ts`. If an external audio file is not yet placed in `public/assets/audio/characters/<slug>/`, `AudioManager` logs a structured warning once and synthesizes a distinct character-specific Web Audio sound effect (`isTemporaryPlaceholder: true`) so gameplay never crashes or goes silent.
