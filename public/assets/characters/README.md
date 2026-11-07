# Filmi Dangal — 3D Character Asset Drop-In Guide

Drop production rigged `.glb` (glTF 2.0 binary) models and portraits into the character folders below:

```
public/assets/characters/
  action-sultan/
    model.glb
    portrait.webp
    animations/        (optional external animation clips)
  romance-raja/
    model.glb
    portrait.webp
    animations/
  dance-dynamo/
    model.glb
    portrait.webp
    animations/
  villain-saab/
    model.glb
    portrait.webp
    animations/
```

## How to Activate a Production GLB Model
1. Place the rigged `.glb` file at `public/assets/characters/<character-slug>/model.glb`.
2. Open `src/config/characterAssets.ts`.
3. Set `isTemporaryPlaceholder: false` on that character's entry in `CHARACTER_ASSET_MANIFEST`.
4. Adjust `scale`, `facingAngle`, `groundOffset`, `positionOffset`, or `animations` clip mappings in `src/config/characterAssets.ts` if your exported GLB uses custom clip names or scale.
