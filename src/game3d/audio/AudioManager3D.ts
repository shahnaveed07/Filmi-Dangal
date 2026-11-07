import { AudioManager } from '../../engine/AudioManager';
import { FighterId } from '../../types/fighter';

/**
 * 3D Audio Manager wrapper adding character-specific SuperShot and SuperMove sound cues.
 */
export class AudioManager3D {
  public static playSuperShotSound(characterId: FighterId): void {
    const audio = AudioManager.getInstance();
    if (characterId === 'action_sultan' || characterId === 'villain_saab') {
      audio.playSound('dishoom');
    } else {
      audio.playSound('whoosh');
    }
  }

  public static playSuperMoveSound(_characterId: FighterId): void {
    const audio = AudioManager.getInstance();
    audio.playSound('super');
  }
}

export { AudioManager };
