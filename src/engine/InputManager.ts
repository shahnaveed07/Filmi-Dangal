import { InputFrame } from '../types/fighter';
import { SettingsManager } from './SettingsManager';

export interface InputSnapshot {
  moveLeft: boolean;
  moveRight: boolean;
  upHeld: boolean;
  downHeld: boolean;
  jumpJustPressed: boolean;
  jumpHeld: boolean;
  crouchHeld: boolean;
  blockHeld: boolean;
  punchJustPressed: boolean;
  kickJustPressed: boolean;
  grabJustPressed: boolean;
  superShotJustPressed: boolean;
  superMoveJustPressed: boolean;
  superJustPressed: boolean;
  pauseJustPressed: boolean;
  muteJustPressed: boolean;
  debugJustPressed: boolean;
}

export const EMPTY_INPUT_FRAME: InputFrame = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  crouch: false,
  block: false,
  punch: false,
  kick: false,
  grab: false,
  superShot: false,
  superMove: false,
  special: false,
  pause: false,
  upJustPressed: false,
  jumpJustPressed: false,
  punchJustPressed: false,
  kickJustPressed: false,
  grabJustPressed: false,
  superShotJustPressed: false,
  superMoveJustPressed: false,
  specialJustPressed: false,
  pauseJustPressed: false,
};

function expandKeyAlias(label: string): string[] {
  const lower = label.trim().toLowerCase();
  if (lower === 'space' || lower === ' ') {
    return [' ', 'space'];
  }
  if (lower === 'shift' || lower === 'shiftleft' || lower === 'shiftright') {
    return ['shift', 'shiftleft', 'shiftright'];
  }
  if (lower === 'ctrl' || lower === 'control' || lower === 'controlleft' || lower === 'controlright') {
    return ['control', 'controlleft', 'controlright', 'ctrl'];
  }
  if (lower.length === 1 && lower >= 'a' && lower <= 'z') {
    return [lower, `key${lower}`];
  }
  return [lower];
}

export class InputManager {
  private static instance: InputManager;
  private heldKeys: Set<string> = new Set();
  private justPressedKeys: Set<string> = new Set();

  // Virtual touch controls state (supporting multitouch pointer tracking)
  private activeTouchPointers: Map<number, string> = new Map();
  private virtualHeld: Set<string> = new Set();
  private virtualJustPressed: Set<string> = new Set();

  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundBlur: () => void;
  private boundVisibilityChange: () => void;

  public static getInstance(): InputManager {
    if (!InputManager.instance) {
      InputManager.instance = new InputManager();
    }
    return InputManager.instance;
  }

  private constructor() {
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundBlur = this.handleBlur.bind(this);
    this.boundVisibilityChange = this.handleVisibilityChange.bind(this);

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundKeyDown, { passive: false });
      window.addEventListener('keyup', this.boundKeyUp);
      window.addEventListener('blur', this.boundBlur);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.boundVisibilityChange);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      const activeTag =
        typeof document !== 'undefined' ? document.activeElement?.tagName.toLowerCase() : '';
      if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
        e.preventDefault();
      }
    }

    if (e.repeat) {
      return;
    }

    const key = e.key.toLowerCase();
    const code = e.code.toLowerCase();

    if (!this.heldKeys.has(key) && !this.heldKeys.has(code)) {
      this.justPressedKeys.add(key);
      this.justPressedKeys.add(code);
    }
    this.heldKeys.add(key);
    this.heldKeys.add(code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    const code = e.code.toLowerCase();
    this.heldKeys.delete(key);
    this.heldKeys.delete(code);
  }

  private handleVisibilityChange(): void {
    if (typeof document !== 'undefined' && document.hidden) {
      this.clearAll();
    }
  }

  public handleBlur(): void {
    this.clearAll();
  }

  public clearAll(): void {
    this.heldKeys.clear();
    this.justPressedKeys.clear();
    this.virtualHeld.clear();
    this.virtualJustPressed.clear();
    this.activeTouchPointers.clear();
  }

  public clearTouchInputs(): void {
    this.virtualHeld.clear();
    this.virtualJustPressed.clear();
    this.activeTouchPointers.clear();
  }

  public simulateKeyDown(key: string, code: string = key): void {
    const k = key.toLowerCase();
    const c = code.toLowerCase();
    if (!this.heldKeys.has(k) && !this.heldKeys.has(c)) {
      this.justPressedKeys.add(k);
      this.justPressedKeys.add(c);
    }
    this.heldKeys.add(k);
    this.heldKeys.add(c);
  }

  public simulateKeyUp(key: string, code: string = key): void {
    this.heldKeys.delete(key.toLowerCase());
    this.heldKeys.delete(code.toLowerCase());
  }

  public onVirtualPointerDown(pointerId: number, control: string): void {
    const normalized = control.toLowerCase();
    if (this.activeTouchPointers.has(pointerId)) {
      const prevControl = this.activeTouchPointers.get(pointerId)!;
      if (prevControl !== normalized) {
        this.onVirtualPointerUp(pointerId);
      }
    }

    this.activeTouchPointers.set(pointerId, normalized);
    if (!this.virtualHeld.has(normalized)) {
      this.virtualJustPressed.add(normalized);
    }
    this.virtualHeld.add(normalized);
  }

  public onVirtualPointerUp(pointerId: number): void {
    const control = this.activeTouchPointers.get(pointerId);
    if (control) {
      this.activeTouchPointers.delete(pointerId);
      let stillHeld = false;
      for (const val of this.activeTouchPointers.values()) {
        if (val === control) {
          stillHeld = true;
          break;
        }
      }
      if (!stillHeld) {
        this.virtualHeld.delete(control);
      }
    }
  }

  public onVirtualPointerCancel(pointerId: number): void {
    this.onVirtualPointerUp(pointerId);
  }

  public getActiveTouchCount(): number {
    return this.activeTouchPointers.size;
  }

  public isVirtualControlActive(control: string): boolean {
    return this.virtualHeld.has(control.toLowerCase());
  }

  /**
   * Produces a 60Hz input snapshot strictly for 2D XY plane controls,
   * honoring user-configured custom key bindings from SettingsManager as well
   * as standard arcade fallbacks and multitouch inputs.
   */
  public pollSnapshot(): InputSnapshot {
    const isHeld = (keys: string[]): boolean => {
      return keys.some((k) => this.heldKeys.has(k) || this.virtualHeld.has(k));
    };

    const isJust = (keys: string[]): boolean => {
      return keys.some((k) => this.justPressedKeys.has(k) || this.virtualJustPressed.has(k));
    };

    const bindings = SettingsManager.getInstance().getSettings().keyBindings;

    const leftKeys = [...expandKeyAlias(bindings.moveLeft), 'a', 'keya', 'arrowleft', 'left'];
    const rightKeys = [...expandKeyAlias(bindings.moveRight), 'd', 'keyd', 'arrowright', 'right'];
    const jumpKeys = [
      ...expandKeyAlias(bindings.jump),
      ' ',
      'space',
      'jump',
      'up',
      'w',
      'keyw',
      'arrowup',
    ];
    const crouchKeys = [
      ...expandKeyAlias(bindings.crouch),
      'control',
      'controlleft',
      'controlright',
      'ctrl',
      'c',
      'keyc',
      'crouch',
      's',
      'keys',
      'arrowdown',
      'down',
    ];
    const blockKeys = [
      ...expandKeyAlias(bindings.block),
      'shift',
      'shiftleft',
      'shiftright',
      'b',
      'keyb',
      'block',
    ];
    const punchKeys = [...expandKeyAlias(bindings.punch), 'j', 'keyj', 'punch'];
    const kickKeys = [...expandKeyAlias(bindings.kick), 'k', 'keyk', 'kick'];
    const grabKeys = [...expandKeyAlias(bindings.grab), 'i', 'keyi', 'grab'];
    const superShotKeys = [
      ...expandKeyAlias(bindings.superShot),
      'u',
      'keyu',
      'supershot',
      'super_shot',
    ];
    const superMoveKeys = [
      ...expandKeyAlias(bindings.superMove),
      'l',
      'keyl',
      'supermove',
      'super_move',
      'super',
    ];

    const superMoveJust = isJust(superMoveKeys);
    const superShotJust = isJust(superShotKeys);

    const snapshot: InputSnapshot = {
      moveLeft: isHeld(leftKeys),
      moveRight: isHeld(rightKeys),
      upHeld: isHeld(jumpKeys),
      downHeld: isHeld(crouchKeys),
      jumpJustPressed: isJust(jumpKeys),
      jumpHeld: isHeld(jumpKeys),
      crouchHeld: isHeld(crouchKeys),
      blockHeld: isHeld(blockKeys),
      punchJustPressed: isJust(punchKeys),
      kickJustPressed: isJust(kickKeys),
      grabJustPressed: isJust(grabKeys),
      superShotJustPressed: superShotJust,
      superMoveJustPressed: superMoveJust,
      superJustPressed: superMoveJust,
      pauseJustPressed: isJust(['escape', 'p', 'keyp', 'pause']),
      muteJustPressed: isJust(['m', 'keym', 'mute']),
      debugJustPressed: isJust(['f2', 'h', 'keyh', 'debug']),
    };

    this.justPressedKeys.clear();
    this.virtualJustPressed.clear();

    return snapshot;
  }

  public snapshotToInputFrame(snap: InputSnapshot): InputFrame {
    return {
      left: snap.moveLeft,
      right: snap.moveRight,
      up: snap.upHeld,
      down: snap.downHeld,
      jump: snap.jumpHeld,
      crouch: snap.crouchHeld,
      block: snap.blockHeld,
      punch: snap.punchJustPressed,
      kick: snap.kickJustPressed,
      grab: snap.grabJustPressed,
      superShot: snap.superShotJustPressed,
      superMove: snap.superMoveJustPressed,
      special: snap.superMoveJustPressed,
      pause: snap.pauseJustPressed,
      upJustPressed: snap.jumpJustPressed,
      jumpJustPressed: snap.jumpJustPressed,
      punchJustPressed: snap.punchJustPressed,
      kickJustPressed: snap.kickJustPressed,
      grabJustPressed: snap.grabJustPressed,
      superShotJustPressed: snap.superShotJustPressed,
      superMoveJustPressed: snap.superMoveJustPressed,
      specialJustPressed: snap.superMoveJustPressed,
      pauseJustPressed: snap.pauseJustPressed,
    };
  }
}
