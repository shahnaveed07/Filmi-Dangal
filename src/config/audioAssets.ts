import { FighterId } from '../types/fighter';
import { CHARACTER_ASSET_MANIFEST } from './characterAssets';

/**
 * Standardized per-character audio event types (Section 5.1 & 5.2).
 */
export type CharacterAudioEventId =
  | 'supershot-charge'
  | 'supershot-release'
  | 'supershot-impact'
  | 'supermove-charge'
  | 'supermove-impact'
  | 'normal-attack'
  | 'hit-react'
  | 'victory'
  | 'defeat';

export const ALL_CHARACTER_AUDIO_EVENTS: readonly CharacterAudioEventId[] = [
  'supershot-charge',
  'supershot-release',
  'supershot-impact',
  'supermove-charge',
  'supermove-impact',
  'normal-attack',
  'hit-react',
  'victory',
  'defeat',
] as const;

export type CommonAudioEventId =
  | 'ui-click'
  | 'round-announce'
  | 'fight-announce'
  | 'ko-announce'
  | 'block-guard'
  | 'whoosh';

export interface ProceduralAudioSynthProfile {
  waveform: OscillatorType;
  startFreqHz: number;
  midFreqHz?: number;
  endFreqHz: number;
  durationSec: number;
  gainLevel: number;
  harmonicRatio?: number;
}

export interface CharacterAudioEventConfig {
  eventId: CharacterAudioEventId;
  filePath: string;
  fallbackSynth: ProceduralAudioSynthProfile;
}

export type CharacterAudioManifest = Record<
  FighterId,
  Record<CharacterAudioEventId, CharacterAudioEventConfig>
>;

/**
 * Distinct per-character audio manifest mapping every character (`action_sultan`,
 * `romance_raja`, `dance_dynamo`, `villain_saab`) and every combat/special audio event
 * to its external audio file path (`public/assets/audio/characters/<slug>/<event>.ogg`)
 * plus a character-specific Web Audio synthesis fallback profile when the external file
 * is not yet present on disk.
 */
export const CHARACTER_AUDIO_MANIFEST: CharacterAudioManifest = {
  action_sultan: {
    'supershot-charge': {
      eventId: 'supershot-charge',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.superShotChargeSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 140,
        midFreqHz: 320,
        endFreqHz: 520,
        durationSec: 0.28,
        gainLevel: 0.55,
        harmonicRatio: 1.5,
      },
    },
    'supershot-release': {
      eventId: 'supershot-release',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.superShotReleaseSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 540,
        midFreqHz: 260,
        endFreqHz: 95,
        durationSec: 0.34,
        gainLevel: 0.68,
        harmonicRatio: 2.0,
      },
    },
    'supershot-impact': {
      eventId: 'supershot-impact',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.superShotImpactSfx,
      fallbackSynth: {
        waveform: 'triangle',
        startFreqHz: 240,
        midFreqHz: 90,
        endFreqHz: 38,
        durationSec: 0.42,
        gainLevel: 0.82,
        harmonicRatio: 0.5,
      },
    },
    'supermove-charge': {
      eventId: 'supermove-charge',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.superMoveChargeSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 95,
        midFreqHz: 420,
        endFreqHz: 780,
        durationSec: 0.52,
        gainLevel: 0.72,
        harmonicRatio: 1.5,
      },
    },
    'supermove-impact': {
      eventId: 'supermove-impact',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.superMoveImpactSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 310,
        midFreqHz: 75,
        endFreqHz: 28,
        durationSec: 0.65,
        gainLevel: 0.92,
        harmonicRatio: 0.5,
      },
    },
    'normal-attack': {
      eventId: 'normal-attack',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.normalAttackSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 210,
        endFreqHz: 55,
        durationSec: 0.14,
        gainLevel: 0.55,
      },
    },
    'hit-react': {
      eventId: 'hit-react',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.hitReactSfx,
      fallbackSynth: {
        waveform: 'triangle',
        startFreqHz: 180,
        endFreqHz: 65,
        durationSec: 0.16,
        gainLevel: 0.5,
      },
    },
    victory: {
      eventId: 'victory',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.victorySfx,
      fallbackSynth: {
        waveform: 'square',
        startFreqHz: 261.63,
        midFreqHz: 329.63,
        endFreqHz: 523.25,
        durationSec: 0.55,
        gainLevel: 0.55,
      },
    },
    defeat: {
      eventId: 'defeat',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.defeatSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 160,
        endFreqHz: 38,
        durationSec: 0.65,
        gainLevel: 0.6,
      },
    },
  },

  romance_raja: {
    'supershot-charge': {
      eventId: 'supershot-charge',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.superShotChargeSfx,
      fallbackSynth: {
        waveform: 'sine',
        startFreqHz: 330,
        midFreqHz: 554.37,
        endFreqHz: 880,
        durationSec: 0.28,
        gainLevel: 0.52,
        harmonicRatio: 2.0,
      },
    },
    'supershot-release': {
      eventId: 'supershot-release',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.superShotReleaseSfx,
      fallbackSynth: {
        waveform: 'triangle',
        startFreqHz: 784,
        midFreqHz: 440,
        endFreqHz: 196,
        durationSec: 0.34,
        gainLevel: 0.64,
        harmonicRatio: 1.5,
      },
    },
    'supershot-impact': {
      eventId: 'supershot-impact',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.superShotImpactSfx,
      fallbackSynth: {
        waveform: 'triangle',
        startFreqHz: 360,
        midFreqHz: 140,
        endFreqHz: 52,
        durationSec: 0.38,
        gainLevel: 0.78,
        harmonicRatio: 1.25,
      },
    },
    'supermove-charge': {
      eventId: 'supermove-charge',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.superMoveChargeSfx,
      fallbackSynth: {
        waveform: 'triangle',
        startFreqHz: 220,
        midFreqHz: 554.37,
        endFreqHz: 987.77,
        durationSec: 0.5,
        gainLevel: 0.68,
        harmonicRatio: 2.0,
      },
    },
    'supermove-impact': {
      eventId: 'supermove-impact',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.superMoveImpactSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 440,
        midFreqHz: 110,
        endFreqHz: 36,
        durationSec: 0.6,
        gainLevel: 0.88,
        harmonicRatio: 1.5,
      },
    },
    'normal-attack': {
      eventId: 'normal-attack',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.normalAttackSfx,
      fallbackSynth: {
        waveform: 'triangle',
        startFreqHz: 260,
        endFreqHz: 75,
        durationSec: 0.12,
        gainLevel: 0.52,
      },
    },
    'hit-react': {
      eventId: 'hit-react',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.hitReactSfx,
      fallbackSynth: {
        waveform: 'sine',
        startFreqHz: 230,
        endFreqHz: 85,
        durationSec: 0.15,
        gainLevel: 0.48,
      },
    },
    victory: {
      eventId: 'victory',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.victorySfx,
      fallbackSynth: {
        waveform: 'triangle',
        startFreqHz: 329.63,
        midFreqHz: 440,
        endFreqHz: 659.25,
        durationSec: 0.58,
        gainLevel: 0.55,
      },
    },
    defeat: {
      eventId: 'defeat',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.defeatSfx,
      fallbackSynth: {
        waveform: 'triangle',
        startFreqHz: 210,
        endFreqHz: 48,
        durationSec: 0.6,
        gainLevel: 0.58,
      },
    },
  },

  dance_dynamo: {
    'supershot-charge': {
      eventId: 'supershot-charge',
      filePath: CHARACTER_ASSET_MANIFEST.dance_dynamo.audio.superShotChargeSfx,
      fallbackSynth: {
        waveform: 'square',
        startFreqHz: 280,
        midFreqHz: 680,
        endFreqHz: 1120,
        durationSec: 0.25,
        gainLevel: 0.5,
        harmonicRatio: 1.5,
      },
    },
    'supershot-release': {
      eventId: 'supershot-release',
      filePath: CHARACTER_ASSET_MANIFEST.dance_dynamo.audio.superShotReleaseSfx,
      fallbackSynth: {
        waveform: 'square',
        startFreqHz: 960,
        midFreqHz: 420,
        endFreqHz: 140,
        durationSec: 0.3,
        gainLevel: 0.65,
        harmonicRatio: 2.0,
      },
    },
    'supershot-impact': {
      eventId: 'supershot-impact',
      filePath: CHARACTER_ASSET_MANIFEST.dance_dynamo.audio.superShotImpactSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 420,
        midFreqHz: 130,
        endFreqHz: 45,
        durationSec: 0.36,
        gainLevel: 0.8,
        harmonicRatio: 1.5,
      },
    },
    'supermove-charge': {
      eventId: 'supermove-charge',
      filePath: CHARACTER_ASSET_MANIFEST.dance_dynamo.audio.superMoveChargeSfx,
      fallbackSynth: {
        waveform: 'square',
        startFreqHz: 190,
        midFreqHz: 620,
        endFreqHz: 1240,
        durationSec: 0.46,
        gainLevel: 0.68,
        harmonicRatio: 1.5,
      },
    },
    'supermove-impact': {
      eventId: 'supermove-impact',
      filePath: CHARACTER_ASSET_MANIFEST.dance_dynamo.audio.superMoveImpactSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 520,
        midFreqHz: 140,
        endFreqHz: 34,
        durationSec: 0.58,
        gainLevel: 0.9,
        harmonicRatio: 0.75,
      },
    },
    'normal-attack': {
      eventId: 'normal-attack',
      filePath: CHARACTER_ASSET_MANIFEST.dance_dynamo.audio.normalAttackSfx,
      fallbackSynth: {
        waveform: 'square',
        startFreqHz: 310,
        endFreqHz: 85,
        durationSec: 0.11,
        gainLevel: 0.5,
      },
    },
    'hit-react': {
      eventId: 'hit-react',
      filePath: CHARACTER_ASSET_MANIFEST.dance_dynamo.audio.hitReactSfx,
      fallbackSynth: {
        waveform: 'triangle',
        startFreqHz: 250,
        endFreqHz: 90,
        durationSec: 0.14,
        gainLevel: 0.48,
      },
    },
    victory: {
      eventId: 'victory',
      filePath: CHARACTER_ASSET_MANIFEST.dance_dynamo.audio.victorySfx,
      fallbackSynth: {
        waveform: 'square',
        startFreqHz: 392,
        midFreqHz: 523.25,
        endFreqHz: 783.99,
        durationSec: 0.52,
        gainLevel: 0.55,
      },
    },
    defeat: {
      eventId: 'defeat',
      filePath: CHARACTER_ASSET_MANIFEST.dance_dynamo.audio.defeatSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 240,
        endFreqHz: 52,
        durationSec: 0.58,
        gainLevel: 0.56,
      },
    },
  },

  villain_saab: {
    'supershot-charge': {
      eventId: 'supershot-charge',
      filePath: CHARACTER_ASSET_MANIFEST.villain_saab.audio.superShotChargeSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 85,
        midFreqHz: 180,
        endFreqHz: 310,
        durationSec: 0.34,
        gainLevel: 0.62,
        harmonicRatio: 0.5,
      },
    },
    'supershot-release': {
      eventId: 'supershot-release',
      filePath: CHARACTER_ASSET_MANIFEST.villain_saab.audio.superShotReleaseSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 340,
        midFreqHz: 140,
        endFreqHz: 48,
        durationSec: 0.38,
        gainLevel: 0.74,
        harmonicRatio: 0.5,
      },
    },
    'supershot-impact': {
      eventId: 'supershot-impact',
      filePath: CHARACTER_ASSET_MANIFEST.villain_saab.audio.superShotImpactSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 180,
        midFreqHz: 62,
        endFreqHz: 24,
        durationSec: 0.48,
        gainLevel: 0.88,
        harmonicRatio: 0.5,
      },
    },
    'supermove-charge': {
      eventId: 'supermove-charge',
      filePath: CHARACTER_ASSET_MANIFEST.villain_saab.audio.superMoveChargeSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 65,
        midFreqHz: 210,
        endFreqHz: 460,
        durationSec: 0.58,
        gainLevel: 0.78,
        harmonicRatio: 0.5,
      },
    },
    'supermove-impact': {
      eventId: 'supermove-impact',
      filePath: CHARACTER_ASSET_MANIFEST.villain_saab.audio.superMoveImpactSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 220,
        midFreqHz: 55,
        endFreqHz: 20,
        durationSec: 0.72,
        gainLevel: 0.96,
        harmonicRatio: 0.5,
      },
    },
    'normal-attack': {
      eventId: 'normal-attack',
      filePath: CHARACTER_ASSET_MANIFEST.villain_saab.audio.normalAttackSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 150,
        endFreqHz: 40,
        durationSec: 0.16,
        gainLevel: 0.62,
      },
    },
    'hit-react': {
      eventId: 'hit-react',
      filePath: CHARACTER_ASSET_MANIFEST.villain_saab.audio.hitReactSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 135,
        endFreqHz: 45,
        durationSec: 0.18,
        gainLevel: 0.55,
      },
    },
    victory: {
      eventId: 'victory',
      filePath: CHARACTER_ASSET_MANIFEST.villain_saab.audio.victorySfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 146.83,
        midFreqHz: 220,
        endFreqHz: 293.66,
        durationSec: 0.62,
        gainLevel: 0.6,
      },
    },
    defeat: {
      eventId: 'defeat',
      filePath: CHARACTER_ASSET_MANIFEST.villain_saab.audio.defeatSfx,
      fallbackSynth: {
        waveform: 'sawtooth',
        startFreqHz: 120,
        endFreqHz: 28,
        durationSec: 0.72,
        gainLevel: 0.65,
      },
    },
  },
};

export function getCharacterAudioEventConfig(
  characterId: FighterId,
  eventId: CharacterAudioEventId
): CharacterAudioEventConfig {
  const charAudio =
    CHARACTER_AUDIO_MANIFEST[characterId] || CHARACTER_AUDIO_MANIFEST.action_sultan;
  return charAudio[eventId];
}
