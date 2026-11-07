import { CharacterId } from '../../types/fighter';
import { Fighter3D } from './Fighter3D';

/**
 * CharacterSpecialMoveController
 *
 * Coordinates the two completely unique special attacks (`SuperShot` and `SuperMove`)
 * for each of the four characters:
 * 1. Action Sultan:
 *    - SuperShot: POWERLINE BLAST (Anim_AS_SuperShot_PowerlineBlast)
 *    - SuperMove: SULTAN BREAKER (Anim_AS_SuperMove_SultanBreaker)
 * 2. Romance Raja:
 *    - SuperShot: DIL SE PULSE (Anim_RR_SuperShot_DilSePulse)
 *    - SuperMove: BAADSHAH'S GRAND GESTURE (Anim_RR_SuperMove_BaadshahGrandGesture)
 * 3. Dance Dynamo:
 *    - SuperShot: BEAT DROP (Anim_DD_SuperShot_BeatDrop)
 *    - SuperMove: RHYTHM OVERDRIVE (Anim_DD_SuperMove_RhythmOverdrive)
 * 4. Villain Saab:
 *    - SuperShot: UNDERWORLD BARRAGE (Anim_VS_SuperShot_UnderworldBarrage)
 *    - SuperMove: BLACKOUT VERDICT (Anim_VS_SuperMove_BlackoutVerdict)
 */

export interface SpecialMoveProfile {
  characterId: CharacterId;
  superShotName: string;
  superMoveName: string;
  superShotAnimName: string;
  superMoveAnimName: string;
  superShotChoreography: string;
  superMoveChoreography: string;
  superMoveRushMultiplier: number;
  superMoveVerticalArc: number;
  superMoveShockwaveRadius: number;
}

const SPECIAL_MOVE_PROFILES: Record<CharacterId, SpecialMoveProfile> = {
  action_sultan: {
    characterId: 'action_sultan',
    superShotName: 'POWERLINE BLAST',
    superMoveName: 'SULTAN BREAKER',
    superShotAnimName: 'Anim_AS_SuperShot_PowerlineBlast',
    superMoveAnimName: 'Anim_AS_SuperMove_SultanBreaker',
    superShotChoreography:
      'Wide brawler plant -> Firoza bracelet charge -> explosive two-handed forward palm thrust',
    superMoveChoreography:
      'Collar/sleeve flex taunt -> unstoppable forward shoulder tackle -> two-handed seismic ground slam',
    superMoveRushMultiplier: 1.15,
    superMoveVerticalArc: 0.14,
    superMoveShockwaveRadius: 2.2,
  },
  romance_raja: {
    characterId: 'romance_raja',
    superShotName: 'DIL SE PULSE',
    superMoveName: "BAADSHAH'S GRAND GESTURE",
    superShotAnimName: 'Anim_RR_SuperShot_DilSePulse',
    superMoveAnimName: 'Anim_RR_SuperMove_BaadshahGrandGesture',
    superShotChoreography:
      'Dramatic step-back spin -> sweeping wide open-arms pose -> chest-projected crimson-gold wave',
    superMoveChoreography:
      'Spotlight spin -> rapid 3-palm flurry -> levitating signature open-arms radial burst',
    superMoveRushMultiplier: 1.0,
    superMoveVerticalArc: 0.25,
    superMoveShockwaveRadius: 2.0,
  },
  dance_dynamo: {
    characterId: 'dance_dynamo',
    superShotName: 'BEAT DROP',
    superMoveName: 'RHYTHM OVERDRIVE',
    superShotAnimName: 'Anim_DD_SuperShot_BeatDrop',
    superMoveAnimName: 'Anim_DD_SuperMove_RhythmOverdrive',
    superShotChoreography:
      'Syncopated prep -> 360-degree tornado crescent kick slicing a cyan-gold sonic wave',
    superMoveChoreography:
      'Multi-spin helicopter cyclone kick -> high-altitude scissor-kick slam',
    superMoveRushMultiplier: 1.28,
    superMoveVerticalArc: 0.36,
    superMoveShockwaveRadius: 1.9,
  },
  villain_saab: {
    characterId: 'villain_saab',
    superShotName: 'UNDERWORLD BARRAGE',
    superMoveName: 'BLACKOUT VERDICT',
    superShotAnimName: 'Anim_VS_SuperShot_UnderworldBarrage',
    superMoveAnimName: 'Anim_VS_SuperMove_BlackoutVerdict',
    superShotChoreography:
      'Overhead two-handed lift -> ground-shattering boot stomp launching a floor fissure wave',
    superMoveChoreography:
      'Menacing chest roar -> heavy clothesline rush -> overhead double-fist execution slam',
    superMoveRushMultiplier: 1.08,
    superMoveVerticalArc: 0.1,
    superMoveShockwaveRadius: 2.4,
  },
};

export class CharacterSpecialMoveController {
  public static getProfile(characterId: CharacterId): SpecialMoveProfile {
    return SPECIAL_MOVE_PROFILES[characterId];
  }

  public static getAllProfiles(): SpecialMoveProfile[] {
    return Object.values(SPECIAL_MOVE_PROFILES);
  }

  /**
   * Verifies that all 4 characters have completely unique SuperShot and SuperMove animation clips.
   */
  public static verifyUniqueSpecialAnimations(): boolean {
    const profiles = CharacterSpecialMoveController.getAllProfiles();
    const animSet = new Set<string>();
    for (const p of profiles) {
      if (animSet.has(p.superShotAnimName) || animSet.has(p.superMoveAnimName)) {
        return false;
      }
      animSet.add(p.superShotAnimName);
      animSet.add(p.superMoveAnimName);
    }
    return animSet.size === profiles.length * 2;
  }

  /**
   * Attempts to initiate a character's ranged SuperShot.
   */
  public static tryExecuteSuperShot(fighter: Fighter3D): boolean {
    return fighter.startAttack('super_shot');
  }

  /**
   * Attempts to initiate a character's cinematic SuperMove finisher.
   */
  public static tryExecuteSuperMove(fighter: Fighter3D): boolean {
    return fighter.startAttack('super_move');
  }
}
