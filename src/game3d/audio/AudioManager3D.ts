import { CharacterAudioEventId } from '../../config/audioAssets';
import { AudioManager } from '../../engine/AudioManager';
import { CharacterId } from '../../types/fighter';

/**
 * AudioManager3D
 *
 * Bridges 3D character animation events (`ON_CHARGE_START`, `ON_PROJECTILE_RELEASE`,
 * `ON_SPECIAL_IMPACT`, `ON_SUPERMOVE_CLIMAX`) and combat states to character-specific
 * sound effects in `AudioManager`.
 */
export class AudioManager3D {
  public static getInstance(): AudioManager {
    return AudioManager.getInstance();
  }

  public static playCharacterEvent(
    characterId: CharacterId,
    eventId: CharacterAudioEventId
  ): void {
    AudioManager.getInstance().playCharacterEvent(characterId, eventId);
  }

  public static playSuperShotCharge(characterId: CharacterId): void {
    AudioManager.getInstance().playCharacterEvent(characterId, 'supershot-charge');
  }

  public static playSuperShotRelease(characterId: CharacterId): void {
    AudioManager.getInstance().playCharacterEvent(characterId, 'supershot-release');
  }

  public static playSuperShotImpact(characterId: CharacterId): void {
    AudioManager.getInstance().playCharacterEvent(characterId, 'supershot-impact');
  }

  public static playSuperMoveCharge(characterId: CharacterId): void {
    AudioManager.getInstance().playCharacterEvent(characterId, 'supermove-charge');
  }

  public static playSuperMoveImpact(characterId: CharacterId): void {
    AudioManager.getInstance().playCharacterEvent(characterId, 'supermove-impact');
  }

  public static playSuperShotSound(characterId: CharacterId): void {
    AudioManager.getInstance().playCharacterEvent(characterId, 'supershot-charge');
  }

  public static playSuperMoveSound(characterId: CharacterId): void {
    AudioManager.getInstance().playCharacterEvent(characterId, 'supermove-charge');
  }

  public static playNormalAttack(characterId: CharacterId): void {
    AudioManager.getInstance().playCharacterEvent(characterId, 'normal-attack');
  }

  public static playHitReact(characterId: CharacterId): void {
    AudioManager.getInstance().playCharacterEvent(characterId, 'hit-react');
  }

  public static playVictory(characterId: CharacterId): void {
    AudioManager.getInstance().playCharacterEvent(characterId, 'victory');
  }

  public static playDefeat(characterId: CharacterId): void {
    AudioManager.getInstance().playCharacterEvent(characterId, 'defeat');
  }
}

export { AudioManager };
