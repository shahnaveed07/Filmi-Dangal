import { CharacterId } from '../../types/fighter';
import { FighterAnimationEvents } from '../animation/FighterAnimationEvents';
import { CombatHitEvent3D, CombatSystem3D } from './CombatSystem3D';
import { Fighter3D } from './Fighter3D';

/**
 * CharacterSpecialMoveController
 *
 * Coordinates the two completely unique special attacks (`SuperShot` and `SuperMove`)
 * for each of the four characters and connects them to FighterAnimationEvents and the
 * authoritative combat resolution function (`CombatSystem3D.applyGuaranteedSpecialHit`).
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
      'Wide brawler plant -> turquoise bracelet charge -> explosive two-handed forward palm thrust',
    superMoveChoreography:
      'Collar/sleeve flex taunt -> unstoppable forward shoulder tackle -> two-handed seismic ground slam',
    superMoveRushMultiplier: 1.15,
    superMoveVerticalArc: 0.14,
    superMoveShockwaveRadius: 2.2,
  },
  romance_raja: {
    characterId: 'romance_raja',
    superShotName: 'HEARTBEAT PULSE',
    superMoveName: "MONARCH'S GRAND GESTURE",
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
   * Initiates a character's ranged SuperShot and, if defender & combat are provided,
   * steps the simulation through the configured projectileSpawnFrame to resolve
   * guaranteed damage at the exact animation release event.
   */
  public static tryExecuteSuperShot(
    fighter: Fighter3D,
    defender?: Fighter3D,
    combat?: CombatSystem3D,
    matchPhase: 'round_intro' | 'fighting' | 'ko' | 'time_over' | 'round_end' | 'match_end' = 'fighting'
  ): CombatHitEvent3D | boolean {
    const started = fighter.startAttack('super_shot', matchPhase);
    if (!started) return false;
    if (defender && combat && fighter.currentSpecialActivationId) {
      const spec = FighterAnimationEvents.getMoveSpec(fighter.id, 'super_shot');
      const targetFrame = spec.projectileSpawnFrame ?? spec.startupFrames;
      let resolvedEvent: CombatHitEvent3D | null = null;
      while (fighter.stateFrame < targetFrame) {
        fighter.stepPhysics();
        const evs = combat.updateAndResolveCombat(
          fighter.playerIndex === 0 ? fighter : defender,
          fighter.playerIndex === 0 ? defender : fighter,
          1 / 60,
          matchPhase
        );
        for (const ev of evs) {
          if (ev.activationId === fighter.currentSpecialActivationId) {
            resolvedEvent = ev;
          }
        }
      }
      return resolvedEvent ?? true;
    }
    return true;
  }

  /**
   * Initiates a character's cinematic SuperMove and, if defender & combat are provided,
   * steps the simulation through the configured superMoveClimaxFrame to resolve
   * guaranteed damage at the exact animation climax event.
   */
  public static tryExecuteSuperMove(
    fighter: Fighter3D,
    defender?: Fighter3D,
    combat?: CombatSystem3D,
    matchPhase: 'round_intro' | 'fighting' | 'ko' | 'time_over' | 'round_end' | 'match_end' = 'fighting'
  ): CombatHitEvent3D | boolean {
    const started = fighter.startAttack('super_move', matchPhase);
    if (!started) return false;
    if (defender && combat && fighter.currentSpecialActivationId) {
      const spec = FighterAnimationEvents.getMoveSpec(fighter.id, 'super_move');
      const targetFrame = spec.superMoveClimaxFrame ?? spec.startupFrames;
      let resolvedEvent: CombatHitEvent3D | null = null;
      while (fighter.stateFrame < targetFrame) {
        fighter.stepPhysics();
        const evs = combat.updateAndResolveCombat(
          fighter.playerIndex === 0 ? fighter : defender,
          fighter.playerIndex === 0 ? defender : fighter,
          1 / 60,
          matchPhase
        );
        for (const ev of evs) {
          if (ev.activationId === fighter.currentSpecialActivationId) {
            resolvedEvent = ev;
          }
        }
      }
      return resolvedEvent ?? true;
    }
    return true;
  }
}
