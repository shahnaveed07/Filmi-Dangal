import { ArenaDef, ArenaId } from '../types/fighter';

export const ARENAS: Record<ArenaId, ArenaDef> = {
  award_night: {
    id: 'award_night',
    name: 'Award Night',
    subtitle: 'National Cinema Awards Stage',
    description:
      'A dazzling 3D Bollywood award stage with gleaming golden trophies, sweeping volumetric spotlights, crimson velvet carpets, and pulsing paparazzi flashes.',
    ambientColor: '#10111B',
    groundY: 580,
    stageWidth: 1280,
    bounds3D: {
      minX: -7.5,
      maxX: 7.5,
      minZ: 0,
      maxZ: 0,
      floorY: 0,
    },
    themeFeatures: [
      '3D Golden Film Trophy Statues',
      'Volumetric Sweeping Stage Spotlights',
      'Paparazzi Flash Synchronization',
      'PBR Red Carpet & Gold Inlay Stage',
      '3D LED Archways & Glitter Atmosphere',
    ],
  },
  film_city: {
    id: 'film_city',
    name: 'Film City',
    subtitle: 'Studio Floor 7, Mumbai',
    description:
      'A bustling 3D Bollywood soundstage featuring articulated crane cameras, boom microphones, lighting trusses, dolly tracks, and monumental painted film sets.',
    ambientColor: '#0F172A',
    groundY: 568,
    stageWidth: 1280,
    bounds3D: {
      minX: -7.5,
      maxX: 7.5,
      minZ: 0,
      maxZ: 0,
      floorY: 0,
    },
    themeFeatures: [
      '3D Articulated Crane Camera Rig',
      'Overhead Lighting Trusses & Catwalks',
      'Studio Floor Dolly Track & Cabling',
      '3D Soundstage Props & Scaffolding',
      'Atmospheric Haze & Warm Key Lights',
    ],
  },
};

export const ARENA_LIST = Object.values(ARENAS);
