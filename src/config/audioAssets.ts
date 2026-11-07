import { FighterId } from '../types/fighter';
import { CHARACTER_ASSET_MANIFEST } from './characterAssets';

/**
 * Standardized per-character audio event types.
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

export interface SynthLayerSpec {
  delaySec: number;
  durationSec: number;
  waveform: OscillatorType;
  startFreqHz: number;
  midFreqHz?: number;
  endFreqHz: number;
  gainLevel: number;
}

export interface ProceduralAudioSynthProfile {
  signatureId: string;
  waveform: OscillatorType;
  startFreqHz: number;
  midFreqHz?: number;
  endFreqHz: number;
  durationSec: number;
  gainLevel: number;
  harmonicRatio?: number;
  layers?: SynthLayerSpec[];
}

export interface CharacterAudioEventConfig {
  eventId: CharacterAudioEventId;
  filePath: string;
  mp3FallbackPath: string;
  isTemporaryPlaceholder: boolean;
  soundDesignDescription: string;
  fallbackSynth: ProceduralAudioSynthProfile;
}

export type CharacterAudioManifest = Record<
  FighterId,
  Record<CharacterAudioEventId, CharacterAudioEventConfig>
>;

/**
 * Distinct per-character audio manifest mapping every character (`action_sultan`,
 * `romance_raja`, `duggu`, `bhidu`) and every combat/special audio event to its
 * external `.ogg` and `.mp3` audio file paths (`public/assets/audio/characters/<slug>/<event>.ogg`)
 * plus a character-specific multi-layered Web Audio synthesis profile (`isTemporaryPlaceholder: true`)
 * until final studio audio files are dropped in.
 */
export const CHARACTER_AUDIO_MANIFEST: CharacterAudioManifest = {
  action_sultan: {
    'supershot-charge': {
      eventId: 'supershot-charge',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.superShotChargeSfx,
      mp3FallbackPath: '/assets/audio/characters/action-sultan/supershot-charge.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: Metallic holster draw slide followed by a crisp double-click revolver hammer cocking.',
      fallbackSynth: {
        signatureId: 'as_gun_draw_and_cock',
        waveform: 'sawtooth',
        startFreqHz: 240,
        midFreqHz: 680,
        endFreqHz: 1240,
        durationSec: 0.28,
        gainLevel: 0.62,
        harmonicRatio: 1.5,
        layers: [
          // Leather/metal draw slide
          {
            delaySec: 0,
            durationSec: 0.11,
            waveform: 'triangle',
            startFreqHz: 190,
            endFreqHz: 460,
            gainLevel: 0.45,
          },
          // Metallic click 1 (cylinder index)
          {
            delaySec: 0.12,
            durationSec: 0.04,
            waveform: 'square',
            startFreqHz: 1450,
            endFreqHz: 920,
            gainLevel: 0.65,
          },
          // Metallic click 2 (hammer lock)
          {
            delaySec: 0.19,
            durationSec: 0.05,
            waveform: 'square',
            startFreqHz: 1880,
            endFreqHz: 1180,
            gainLevel: 0.72,
          },
        ],
      },
    },
    'supershot-release': {
      eventId: 'supershot-release',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.superShotReleaseSfx,
      mp3FallbackPath: '/assets/audio/characters/action-sultan/supershot-release.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: High-transient muzzle crack, deep barrel concussion boom, and ejected brass shell clink.',
      fallbackSynth: {
        signatureId: 'as_blackbuck_gunshot_fire',
        waveform: 'sawtooth',
        startFreqHz: 920,
        midFreqHz: 180,
        endFreqHz: 48,
        durationSec: 0.36,
        gainLevel: 0.85,
        harmonicRatio: 0.5,
        layers: [
          // Supersonic muzzle crack transient
          {
            delaySec: 0,
            durationSec: 0.055,
            waveform: 'square',
            startFreqHz: 2400,
            endFreqHz: 320,
            gainLevel: 0.9,
          },
          // Low barrel powder concussion
          {
            delaySec: 0.01,
            durationSec: 0.28,
            waveform: 'sawtooth',
            startFreqHz: 240,
            midFreqHz: 85,
            endFreqHz: 34,
            gainLevel: 0.85,
          },
          // Ejected brass shell casing ping
          {
            delaySec: 0.22,
            durationSec: 0.08,
            waveform: 'sine',
            startFreqHz: 3150,
            endFreqHz: 2680,
            gainLevel: 0.32,
          },
        ],
      },
    },
    'supershot-impact': {
      eventId: 'supershot-impact',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.superShotImpactSfx,
      mp3FallbackPath: '/assets/audio/characters/action-sultan/supershot-impact.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: Explosive bullet impact burst with metallic cinematic ricochet.',
      fallbackSynth: {
        signatureId: 'as_gunshot_explosive_impact',
        waveform: 'sawtooth',
        startFreqHz: 380,
        midFreqHz: 95,
        endFreqHz: 32,
        durationSec: 0.44,
        gainLevel: 0.88,
        harmonicRatio: 0.5,
        layers: [
          // Heavy explosive punch
          {
            delaySec: 0,
            durationSec: 0.35,
            waveform: 'sawtooth',
            startFreqHz: 310,
            endFreqHz: 28,
            gainLevel: 0.88,
          },
          // Classic cinema ricochet whine
          {
            delaySec: 0.04,
            durationSec: 0.26,
            waveform: 'triangle',
            startFreqHz: 1950,
            midFreqHz: 980,
            endFreqHz: 420,
            gainLevel: 0.48,
          },
        ],
      },
    },
    'supermove-charge': {
      eventId: 'supermove-charge',
      filePath: CHARACTER_ASSET_MANIFEST.action_sultan.audio.superMoveChargeSfx,
      mp3FallbackPath: '/assets/audio/characters/action-sultan/supermove-charge.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Action Sultan power aura charge.',
      fallbackSynth: {
        signatureId: 'as_supermove_charge',
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
      mp3FallbackPath: '/assets/audio/characters/action-sultan/supermove-impact.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Sultan Breaker seismic slam impact.',
      fallbackSynth: {
        signatureId: 'as_supermove_impact',
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
      mp3FallbackPath: '/assets/audio/characters/action-sultan/normal-attack.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Heavy brawler swing.',
      fallbackSynth: {
        signatureId: 'as_normal_attack',
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
      mp3FallbackPath: '/assets/audio/characters/action-sultan/hit-react.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Action Sultan hit grunt.',
      fallbackSynth: {
        signatureId: 'as_hit_react',
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
      mp3FallbackPath: '/assets/audio/characters/action-sultan/victory.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Action Sultan victory fanfare.',
      fallbackSynth: {
        signatureId: 'as_victory',
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
      mp3FallbackPath: '/assets/audio/characters/action-sultan/defeat.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Action Sultan KO fall.',
      fallbackSynth: {
        signatureId: 'as_defeat',
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
      mp3FallbackPath: '/assets/audio/characters/romance-raja/supershot-charge.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: Warm romantic string/harp chord shimmer as Romance Raja opens his arms wide.',
      fallbackSynth: {
        signatureId: 'rr_open_arms_romantic_shimmer',
        waveform: 'sine',
        startFreqHz: 329.63,
        midFreqHz: 554.37,
        endFreqHz: 880,
        durationSec: 0.34,
        gainLevel: 0.56,
        harmonicRatio: 1.5,
        layers: [
          // A-major warm romantic triad shimmer (A4 -> C#5 -> E5 -> A5)
          {
            delaySec: 0,
            durationSec: 0.3,
            waveform: 'sine',
            startFreqHz: 440,
            endFreqHz: 880,
            gainLevel: 0.45,
          },
          {
            delaySec: 0.06,
            durationSec: 0.26,
            waveform: 'triangle',
            startFreqHz: 554.37,
            endFreqHz: 1108.73,
            gainLevel: 0.42,
          },
          {
            delaySec: 0.12,
            durationSec: 0.22,
            waveform: 'sine',
            startFreqHz: 659.25,
            endFreqHz: 1318.5,
            gainLevel: 0.48,
          },
        ],
      },
    },
    'supershot-release': {
      eventId: 'supershot-release',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.superShotReleaseSfx,
      mp3FallbackPath: '/assets/audio/characters/romance-raja/supershot-release.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: Airy wind-swept open-arms release whoosh with golden harmonic swell.',
      fallbackSynth: {
        signatureId: 'rr_open_arms_airy_whoosh',
        waveform: 'triangle',
        startFreqHz: 784,
        midFreqHz: 440,
        endFreqHz: 196,
        durationSec: 0.35,
        gainLevel: 0.66,
        harmonicRatio: 1.25,
        layers: [
          // Sweeping breeze whoosh
          {
            delaySec: 0,
            durationSec: 0.32,
            waveform: 'triangle',
            startFreqHz: 680,
            midFreqHz: 380,
            endFreqHz: 165,
            gainLevel: 0.6,
          },
          // Golden chime tail
          {
            delaySec: 0.04,
            durationSec: 0.28,
            waveform: 'sine',
            startFreqHz: 1174.66,
            endFreqHz: 587.33,
            gainLevel: 0.45,
          },
        ],
      },
    },
    'supershot-impact': {
      eventId: 'supershot-impact',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.superShotImpactSfx,
      mp3FallbackPath: '/assets/audio/characters/romance-raja/supershot-impact.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: Resonant crimson-gold energy-pulse impact flash.',
      fallbackSynth: {
        signatureId: 'rr_energy_pulse_impact',
        waveform: 'triangle',
        startFreqHz: 440,
        midFreqHz: 165,
        endFreqHz: 55,
        durationSec: 0.4,
        gainLevel: 0.8,
        harmonicRatio: 1.5,
        layers: [
          {
            delaySec: 0,
            durationSec: 0.36,
            waveform: 'triangle',
            startFreqHz: 360,
            endFreqHz: 48,
            gainLevel: 0.78,
          },
          {
            delaySec: 0.02,
            durationSec: 0.25,
            waveform: 'sine',
            startFreqHz: 880,
            endFreqHz: 220,
            gainLevel: 0.48,
          },
        ],
      },
    },
    'supermove-charge': {
      eventId: 'supermove-charge',
      filePath: CHARACTER_ASSET_MANIFEST.romance_raja.audio.superMoveChargeSfx,
      mp3FallbackPath: '/assets/audio/characters/romance-raja/supermove-charge.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Monarch Grand Gesture spotlight charge.',
      fallbackSynth: {
        signatureId: 'rr_supermove_charge',
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
      mp3FallbackPath: '/assets/audio/characters/romance-raja/supermove-impact.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Monarch Grand Gesture radial burst impact.',
      fallbackSynth: {
        signatureId: 'rr_supermove_impact',
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
      mp3FallbackPath: '/assets/audio/characters/romance-raja/normal-attack.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Swift velvet strike.',
      fallbackSynth: {
        signatureId: 'rr_normal_attack',
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
      mp3FallbackPath: '/assets/audio/characters/romance-raja/hit-react.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Romance Raja hit reaction.',
      fallbackSynth: {
        signatureId: 'rr_hit_react',
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
      mp3FallbackPath: '/assets/audio/characters/romance-raja/victory.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Romance Raja victory chord.',
      fallbackSynth: {
        signatureId: 'rr_victory',
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
      mp3FallbackPath: '/assets/audio/characters/romance-raja/defeat.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Romance Raja KO fall.',
      fallbackSynth: {
        signatureId: 'rr_defeat',
        waveform: 'triangle',
        startFreqHz: 210,
        endFreqHz: 48,
        durationSec: 0.6,
        gainLevel: 0.58,
      },
    },
  },

  duggu: {
    'supershot-charge': {
      eventId: 'supershot-charge',
      filePath: CHARACTER_ASSET_MANIFEST.duggu.audio.superShotChargeSfx,
      mp3FallbackPath: '/assets/audio/characters/duggu/supershot-charge.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: Energetic 4-step electronic rhythm charge and syncopated dance footwork taps.',
      fallbackSynth: {
        signatureId: 'dg_kaho_naa_rhythm_charge',
        waveform: 'square',
        startFreqHz: 330,
        midFreqHz: 659.25,
        endFreqHz: 1318.5,
        durationSec: 0.3,
        gainLevel: 0.58,
        harmonicRatio: 1.5,
        layers: [
          // 4-step syncopated electronic groove pulses
          {
            delaySec: 0.0,
            durationSec: 0.06,
            waveform: 'square',
            startFreqHz: 330,
            endFreqHz: 440,
            gainLevel: 0.52,
          },
          {
            delaySec: 0.065,
            durationSec: 0.06,
            waveform: 'square',
            startFreqHz: 493.88,
            endFreqHz: 659.25,
            gainLevel: 0.54,
          },
          {
            delaySec: 0.13,
            durationSec: 0.06,
            waveform: 'square',
            startFreqHz: 659.25,
            endFreqHz: 880,
            gainLevel: 0.58,
          },
          {
            delaySec: 0.195,
            durationSec: 0.09,
            waveform: 'sawtooth',
            startFreqHz: 880,
            endFreqHz: 1318.5,
            gainLevel: 0.62,
          },
        ],
      },
    },
    'supershot-release': {
      eventId: 'supershot-release',
      filePath: CHARACTER_ASSET_MANIFEST.duggu.audio.superShotReleaseSfx,
      mp3FallbackPath: '/assets/audio/characters/duggu/supershot-release.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: Syncopated dance-step beat drop and 360-degree acrobatic spinning whoosh.',
      fallbackSynth: {
        signatureId: 'dg_dance_spin_release',
        waveform: 'sawtooth',
        startFreqHz: 1046.5,
        midFreqHz: 523.25,
        endFreqHz: 130.81,
        durationSec: 0.32,
        gainLevel: 0.72,
        harmonicRatio: 2.0,
        layers: [
          // Dance step beat kick
          {
            delaySec: 0,
            durationSec: 0.09,
            waveform: 'sine',
            startFreqHz: 180,
            endFreqHz: 48,
            gainLevel: 0.78,
          },
          // Acrobatic spin Doppler whoosh
          {
            delaySec: 0.03,
            durationSec: 0.26,
            waveform: 'sawtooth',
            startFreqHz: 1180,
            midFreqHz: 480,
            endFreqHz: 190,
            gainLevel: 0.64,
          },
        ],
      },
    },
    'supershot-impact': {
      eventId: 'supershot-impact',
      filePath: CHARACTER_ASSET_MANIFEST.duggu.audio.superShotImpactSfx,
      mp3FallbackPath: '/assets/audio/characters/duggu/supershot-impact.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: High-energy sonic blast and electronic sub-bass drop impact.',
      fallbackSynth: {
        signatureId: 'dg_sonic_blast_impact',
        waveform: 'sawtooth',
        startFreqHz: 520,
        midFreqHz: 140,
        endFreqHz: 42,
        durationSec: 0.38,
        gainLevel: 0.84,
        harmonicRatio: 1.5,
        layers: [
          {
            delaySec: 0,
            durationSec: 0.34,
            waveform: 'sawtooth',
            startFreqHz: 480,
            endFreqHz: 38,
            gainLevel: 0.82,
          },
          {
            delaySec: 0.02,
            durationSec: 0.22,
            waveform: 'square',
            startFreqHz: 960,
            endFreqHz: 240,
            gainLevel: 0.5,
          },
        ],
      },
    },
    'supermove-charge': {
      eventId: 'supermove-charge',
      filePath: CHARACTER_ASSET_MANIFEST.duggu.audio.superMoveChargeSfx,
      mp3FallbackPath: '/assets/audio/characters/duggu/supermove-charge.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Duggu Rhythm Overdrive charge.',
      fallbackSynth: {
        signatureId: 'dg_supermove_charge',
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
      filePath: CHARACTER_ASSET_MANIFEST.duggu.audio.superMoveImpactSfx,
      mp3FallbackPath: '/assets/audio/characters/duggu/supermove-impact.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Duggu Rhythm Overdrive impact.',
      fallbackSynth: {
        signatureId: 'dg_supermove_impact',
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
      filePath: CHARACTER_ASSET_MANIFEST.duggu.audio.normalAttackSfx,
      mp3FallbackPath: '/assets/audio/characters/duggu/normal-attack.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Duggu rapid dance strike.',
      fallbackSynth: {
        signatureId: 'dg_normal_attack',
        waveform: 'square',
        startFreqHz: 310,
        endFreqHz: 85,
        durationSec: 0.11,
        gainLevel: 0.5,
      },
    },
    'hit-react': {
      eventId: 'hit-react',
      filePath: CHARACTER_ASSET_MANIFEST.duggu.audio.hitReactSfx,
      mp3FallbackPath: '/assets/audio/characters/duggu/hit-react.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Duggu hit reaction.',
      fallbackSynth: {
        signatureId: 'dg_hit_react',
        waveform: 'triangle',
        startFreqHz: 250,
        endFreqHz: 90,
        durationSec: 0.14,
        gainLevel: 0.48,
      },
    },
    victory: {
      eventId: 'victory',
      filePath: CHARACTER_ASSET_MANIFEST.duggu.audio.victorySfx,
      mp3FallbackPath: '/assets/audio/characters/duggu/victory.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Duggu victory groove.',
      fallbackSynth: {
        signatureId: 'dg_victory',
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
      filePath: CHARACTER_ASSET_MANIFEST.duggu.audio.defeatSfx,
      mp3FallbackPath: '/assets/audio/characters/duggu/defeat.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Duggu KO fall.',
      fallbackSynth: {
        signatureId: 'dg_defeat',
        waveform: 'sawtooth',
        startFreqHz: 240,
        endFreqHz: 52,
        durationSec: 0.58,
        gainLevel: 0.56,
      },
    },
  },

  bhidu: {
    'supershot-charge': {
      eventId: 'supershot-charge',
      filePath: CHARACTER_ASSET_MANIFEST.bhidu.audio.superShotChargeSfx,
      mp3FallbackPath: '/assets/audio/characters/bhidu/supershot-charge.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: Heavy deliberate boot footsteps, swagger movement rustle, and low-bass rumble.',
      fallbackSynth: {
        signatureId: 'bh_swagger_footsteps_and_bass',
        waveform: 'sawtooth',
        startFreqHz: 68,
        midFreqHz: 115,
        endFreqHz: 195,
        durationSec: 0.36,
        gainLevel: 0.72,
        harmonicRatio: 0.5,
        layers: [
          // Heavy swagger boot step 1
          {
            delaySec: 0.0,
            durationSec: 0.09,
            waveform: 'sine',
            startFreqHz: 115,
            endFreqHz: 34,
            gainLevel: 0.82,
          },
          // Heavy swagger boot step 2
          {
            delaySec: 0.14,
            durationSec: 0.09,
            waveform: 'sine',
            startFreqHz: 125,
            endFreqHz: 36,
            gainLevel: 0.86,
          },
          // Low-bass swagger charge drone
          {
            delaySec: 0.04,
            durationSec: 0.3,
            waveform: 'sawtooth',
            startFreqHz: 58,
            midFreqHz: 92,
            endFreqHz: 148,
            gainLevel: 0.58,
          },
        ],
      },
    },
    'supershot-release': {
      eventId: 'supershot-release',
      filePath: CHARACTER_ASSET_MANIFEST.bhidu.audio.superShotReleaseSfx,
      mp3FallbackPath: '/assets/audio/characters/bhidu/supershot-release.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: Intimidating Bhidu hero-stance plant and low-frequency shockwave release.',
      fallbackSynth: {
        signatureId: 'bh_swagger_stance_release',
        waveform: 'sawtooth',
        startFreqHz: 280,
        midFreqHz: 110,
        endFreqHz: 42,
        durationSec: 0.38,
        gainLevel: 0.8,
        harmonicRatio: 0.5,
        layers: [
          // Heavy stance plant stomp
          {
            delaySec: 0,
            durationSec: 0.14,
            waveform: 'triangle',
            startFreqHz: 160,
            endFreqHz: 32,
            gainLevel: 0.85,
          },
          // Ground ripple wave release
          {
            delaySec: 0.03,
            durationSec: 0.32,
            waveform: 'sawtooth',
            startFreqHz: 260,
            midFreqHz: 95,
            endFreqHz: 38,
            gainLevel: 0.72,
          },
        ],
      },
    },
    'supershot-impact': {
      eventId: 'supershot-impact',
      filePath: CHARACTER_ASSET_MANIFEST.bhidu.audio.superShotImpactSfx,
      mp3FallbackPath: '/assets/audio/characters/bhidu/supershot-impact.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription:
        'Temporary Placeholder: Seismic ground-shockwave impact with sub-bass tremor.',
      fallbackSynth: {
        signatureId: 'bh_ground_shockwave_impact',
        waveform: 'sawtooth',
        startFreqHz: 175,
        midFreqHz: 58,
        endFreqHz: 22,
        durationSec: 0.48,
        gainLevel: 0.92,
        harmonicRatio: 0.5,
        layers: [
          {
            delaySec: 0,
            durationSec: 0.44,
            waveform: 'sawtooth',
            startFreqHz: 165,
            endFreqHz: 22,
            gainLevel: 0.9,
          },
          {
            delaySec: 0.05,
            durationSec: 0.35,
            waveform: 'sine',
            startFreqHz: 85,
            endFreqHz: 24,
            gainLevel: 0.85,
          },
        ],
      },
    },
    'supermove-charge': {
      eventId: 'supermove-charge',
      filePath: CHARACTER_ASSET_MANIFEST.bhidu.audio.superMoveChargeSfx,
      mp3FallbackPath: '/assets/audio/characters/bhidu/supermove-charge.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Bhidu Blackout Verdict charge.',
      fallbackSynth: {
        signatureId: 'bh_supermove_charge',
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
      filePath: CHARACTER_ASSET_MANIFEST.bhidu.audio.superMoveImpactSfx,
      mp3FallbackPath: '/assets/audio/characters/bhidu/supermove-impact.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Bhidu Blackout Verdict impact.',
      fallbackSynth: {
        signatureId: 'bh_supermove_impact',
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
      filePath: CHARACTER_ASSET_MANIFEST.bhidu.audio.normalAttackSfx,
      mp3FallbackPath: '/assets/audio/characters/bhidu/normal-attack.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Bhidu heavy street strike.',
      fallbackSynth: {
        signatureId: 'bh_normal_attack',
        waveform: 'sawtooth',
        startFreqHz: 150,
        endFreqHz: 40,
        durationSec: 0.16,
        gainLevel: 0.62,
      },
    },
    'hit-react': {
      eventId: 'hit-react',
      filePath: CHARACTER_ASSET_MANIFEST.bhidu.audio.hitReactSfx,
      mp3FallbackPath: '/assets/audio/characters/bhidu/hit-react.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Bhidu hit reaction.',
      fallbackSynth: {
        signatureId: 'bh_hit_react',
        waveform: 'sawtooth',
        startFreqHz: 135,
        endFreqHz: 45,
        durationSec: 0.18,
        gainLevel: 0.55,
      },
    },
    victory: {
      eventId: 'victory',
      filePath: CHARACTER_ASSET_MANIFEST.bhidu.audio.victorySfx,
      mp3FallbackPath: '/assets/audio/characters/bhidu/victory.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Bhidu victory theme.',
      fallbackSynth: {
        signatureId: 'bh_victory',
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
      filePath: CHARACTER_ASSET_MANIFEST.bhidu.audio.defeatSfx,
      mp3FallbackPath: '/assets/audio/characters/bhidu/defeat.mp3',
      isTemporaryPlaceholder: true,
      soundDesignDescription: 'Temporary Placeholder: Bhidu KO fall.',
      fallbackSynth: {
        signatureId: 'bh_defeat',
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
