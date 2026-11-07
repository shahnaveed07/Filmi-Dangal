import { Scene, ShadowGenerator } from '@babylonjs/core';
import { CHARACTERS } from '../../data/characters';
import { CharacterDef, CharacterId } from '../../types/fighter';
import {
  CharacterRig3D,
  GLBAssetValidationResult,
  loadCharacterRig3D,
  REQUIRED_HUMANOID_BONES,
  validateGLBBuffer,
} from './AssetLoader3D';
import {
  CharacterAssetValidationReport,
  CharacterAssetValidator,
} from './CharacterAssetValidator';

/**
 * CharacterAssetLoader
 *
 * Production 3D character asset loader for Filmi Dangal 2.0:
 * - Loads optimized binary glTF 2.0 (.glb) models via Babylon SceneLoader
 * - Runs CharacterAssetValidator on binary buffers when available
 * - Provides 26-joint shared humanoid + facial expression rigs
 * - Supports 3 LOD levels (LOD0_High, LOD1_Medium, LOD2_Low)
 * - Supports switching between Stylized 3D Character Mesh and Labeled Graybox Rig Proxy
 */

export interface LoadedCharacterAssetBundle {
  rig: CharacterRig3D;
  characterDef: CharacterDef;
  validationReport: CharacterAssetValidationReport | null;
}

export class CharacterAssetLoader {
  public static readonly REQUIRED_HUMANOID_BONES = REQUIRED_HUMANOID_BONES;

  public static validateGLB(
    characterId: string,
    buffer: Uint8Array
  ): GLBAssetValidationResult {
    return validateGLBBuffer(characterId, buffer);
  }

  public static validateDetailedGLB(
    buffer: ArrayBuffer | Uint8Array,
    characterId?: string
  ): CharacterAssetValidationReport {
    return CharacterAssetValidator.validateGLBBuffer(buffer, characterId);
  }

  public static async loadCharacter(
    scene: Scene,
    characterId: CharacterId,
    instancePrefix = 'fighter',
    shadowGenerator?: ShadowGenerator | null,
    initialRenderMode: 'stylized' | 'graybox' = 'stylized'
  ): Promise<LoadedCharacterAssetBundle> {
    const characterDef = CHARACTERS[characterId] || CHARACTERS.action_sultan;
    let validationReport: CharacterAssetValidationReport | null = null;

    if (typeof fetch !== 'undefined') {
      try {
        const res = await fetch(characterDef.visuals.glbModelPath);
        if (res.ok) {
          const arrayBuf = await res.arrayBuffer();
          validationReport = CharacterAssetValidator.validateGLBBuffer(
            arrayBuf,
            characterDef.id
          );
        }
      } catch {
        validationReport = null;
      }
    }

    const rig = await loadCharacterRig3D(
      scene,
      characterDef,
      instancePrefix,
      shadowGenerator
    );

    if (initialRenderMode === 'graybox') {
      rig.setRenderMode('graybox');
    }

    return {
      rig,
      characterDef,
      validationReport,
    };
  }
}
