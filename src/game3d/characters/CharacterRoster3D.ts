import {
  ALL_FIGHTER_IDS,
  CHARACTER_ASSET_MANIFEST,
  CharacterAssetConfig,
  getCharacterAssetConfig,
  isValidFighterId,
  normalizeFighterId,
} from '../../config/characterAssets';
import { CHARACTERS, CHARACTER_LIST } from '../../data/characters';
import { CharacterDef, FighterId } from '../../types/fighter';

export { ALL_FIGHTER_IDS, CHARACTERS, CHARACTER_LIST, isValidFighterId, normalizeFighterId };

/**
 * Authoritative end-to-end character identity binding:
 * `FighterId → CharacterDef → CharacterAssetConfig → Model Path`
 */
export interface AuthoritativeCharacterMapping {
  fighterId: FighterId;
  characterDef: CharacterDef;
  assetConfig: CharacterAssetConfig;
  modelPath: string;
  legacyModelPath?: string;
  isTemporaryPlaceholder: boolean;
}

export function getCharacter3DDef(id: FighterId): CharacterDef {
  if (isValidFighterId(id)) {
    return CHARACTERS[id];
  }
  const normalized = normalizeFighterId(String(id));
  return CHARACTERS[normalized];
}

/**
 * Resolves the authoritative mapping for a fighter and verifies that
 * `FighterId`, `CharacterDef.id`, `CharacterAssetConfig.id`, and `modelPath`
 * all correspond to the exact same fighter with zero cross-character aliasing.
 */
export function resolveAuthoritativeCharacterMapping(
  id: FighterId
): AuthoritativeCharacterMapping {
  if (!isValidFighterId(id)) {
    throw new Error(`[CharacterRoster3D] Invalid FighterId: "${String(id)}"`);
  }
  const characterDef = CHARACTERS[id];
  const assetConfig = getCharacterAssetConfig(id);

  if (!characterDef || characterDef.id !== id) {
    throw new Error(
      `[CharacterRoster3D] CharacterDef mismatch for "${id}": got "${characterDef?.id}"`
    );
  }
  if (!assetConfig || assetConfig.id !== id) {
    throw new Error(
      `[CharacterRoster3D] CharacterAssetConfig mismatch for "${id}": got "${assetConfig?.id}"`
    );
  }
  if (
    characterDef.visuals.glbModelPath &&
    characterDef.visuals.glbModelPath !== assetConfig.modelPath
  ) {
    throw new Error(
      `[CharacterRoster3D] Model path mismatch for "${id}": CharacterDef has "${characterDef.visuals.glbModelPath}" vs CharacterAssetConfig "${assetConfig.modelPath}"`
    );
  }

  return {
    fighterId: id,
    characterDef,
    assetConfig,
    modelPath: assetConfig.modelPath,
    legacyModelPath: assetConfig.legacyModelPath,
    isTemporaryPlaceholder: assetConfig.isTemporaryPlaceholder,
  };
}

/**
 * Verifies that all 4 fighters in the roster have unique, non-overlapping
 * `FighterId → CharacterDef → CharacterAssetConfig → modelPath` mappings.
 */
export function verifyAllAuthoritativeCharacterMappings(): {
  valid: boolean;
  mappings: Record<FighterId, AuthoritativeCharacterMapping>;
  errors: string[];
} {
  const errors: string[] = [];
  const seenModelPaths = new Map<string, FighterId>();
  const mappings = {} as Record<FighterId, AuthoritativeCharacterMapping>;

  for (const id of ALL_FIGHTER_IDS) {
    try {
      const mapping = resolveAuthoritativeCharacterMapping(id);
      mappings[id] = mapping;

      const prevOwner = seenModelPaths.get(mapping.modelPath);
      if (prevOwner && prevOwner !== id) {
        errors.push(
          `Duplicate modelPath "${mapping.modelPath}" shared by "${prevOwner}" and "${id}"`
        );
      } else {
        seenModelPaths.set(mapping.modelPath, id);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (Object.keys(CHARACTER_ASSET_MANIFEST).length !== ALL_FIGHTER_IDS.length) {
    errors.push(
      `CHARACTER_ASSET_MANIFEST count (${Object.keys(CHARACTER_ASSET_MANIFEST).length}) !== ALL_FIGHTER_IDS count (${ALL_FIGHTER_IDS.length})`
    );
  }

  return {
    valid: errors.length === 0,
    mappings,
    errors,
  };
}

export function getCharacterMonogram(id: FighterId): string {
  switch (id) {
    case 'action_sultan':
      return 'AS';
    case 'romance_raja':
      return 'RR';
    case 'duggu':
      return 'DG';
    case 'bhidu':
      return 'BH';
  }
}

export interface FighterSelectionState {
  p1Id: FighterId;
  p2Id: FighterId;
  selectingFor: 'p1' | 'p2';
}

/**
 * Pure, deterministic Player 1 / Player 2 character selection & duplicate replacement logic.
 * - Updates the active slot (`p1` or `p2`) to `chosenId`.
 * - Does not alter the other player's selection unless `chosenId` duplicates the other player's current ID,
 *   in which case the other player receives the active slot's previous fighter (or the first distinct roster fighter).
 */
export function applyFighterSelection(
  current: FighterSelectionState,
  chosenId: FighterId
): FighterSelectionState {
  if (current.selectingFor === 'p1') {
    const prevP1 = current.p1Id;
    let nextP2 = current.p2Id;
    if (nextP2 === chosenId) {
      nextP2 =
        prevP1 !== chosenId
          ? prevP1
          : CHARACTER_LIST.find((c) => c.id !== chosenId)!.id;
    }
    return {
      p1Id: chosenId,
      p2Id: nextP2,
      selectingFor: current.selectingFor,
    };
  } else {
    const prevP2 = current.p2Id;
    let nextP1 = current.p1Id;
    if (nextP1 === chosenId) {
      nextP1 =
        prevP2 !== chosenId
          ? prevP2
          : CHARACTER_LIST.find((c) => c.id !== chosenId)!.id;
    }
    return {
      p1Id: nextP1,
      p2Id: chosenId,
      selectingFor: current.selectingFor,
    };
  }
}


