import { ArenaDef, ArenaId } from '../types/fighter';

export const ARENAS: Record<ArenaId, ArenaDef> = {
  award_night: {
    id: 'award_night',
    name: 'Award Night',
    subtitle: 'National Cinema Awards Stage',
    description: 'A dazzling Bollywood award stage with gleaming golden trophies, sweeping spotlights, crimson carpets, and pulsing paparazzi flashes.',
    ambientColor: '#10111B',
    groundY: 580,
    stageWidth: 1280,
    themeFeatures: [
      'Gleaming Golden Trophy Statues',
      'Dual Sweeping Stage Spotlights',
      'Paparazzi Flash Synchronization',
      'Red Carpet Stage Flooring',
      'Glittering Particle Atmosphere',
    ],
  },
  film_city: {
    id: 'film_city',
    name: 'Film City',
    subtitle: 'Studio Floor 7, Mumbai',
    description: 'A bustling Bollywood production set featuring high-tech crane cameras, boom microphones, scaffolding with halogen lights, and iconic vintage movie posters.',
    ambientColor: '#0F172A',
    groundY: 580,
    stageWidth: 1280,
    themeFeatures: [
      'Articulated Crane Camera Rig',
      'Overhead Boom Mic and Studio Grid',
      'Halogen Fill Lights and Gel Filters',
      'Production Clapboard Markers',
      'Film Studio Dolly Track Base',
    ],
  },
};

export const ARENA_LIST = Object.values(ARENAS);
