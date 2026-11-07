import { CHARACTERS, CHARACTER_LIST } from '../../data/characters';
import { CharacterDef, FighterId } from '../../types/fighter';

export { CHARACTERS, CHARACTER_LIST };

export function getCharacter3DDef(id: FighterId): CharacterDef {
  return CHARACTERS[id] || CHARACTERS.action_sultan;
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
