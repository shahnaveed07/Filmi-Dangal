import { InputFrame } from '../types/fighter';

export interface InputSnapshot {
  moveLeft: boolean;
  moveRight: boolean;
  sidestepUpHeld: boolean;
  sidestepDownHeld: boolean;
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
  sidestepUp: false,
  sidestepDown: false,
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

  /**
   * Produce 60Hz input snapshot supporting both 3D controls (WASD 3D movement, SPACE jump,
   * CTRL crouch, SHIFT block, J punch, K kick, I grab, U SuperShot, L SuperMove) and touch inputs.
   */
  public pollSnapshot(): InputSnapshot {
    const isHeld = (keys: string[]): boolean => {
      return keys.some((k) => this.heldKeys.has(k) || this.virtualHeld.has(k));
    };

    const isJust = (keys: string[]): boolean => {
      return keys.some((k) => this.justPressedKeys.has(k) || this.virtualJustPressed.has(k));
    };

    const superMoveJust = isJust(['l', 'keyl', 'supermove', 'super_move', 'super']);
    const superShotJust = isJust(['u', 'keyu', 'supershot', 'super_shot']);

    const snapshot: InputSnapshot = {
      moveLeft: isHeld(['a', 'keya', 'arrowleft', 'left']),
      moveRight: isHeld(['d', 'keyd', 'arrowright', 'right']),
      sidestepUpHeld: isHeld(['w', 'keyw', 'arrowup', 'sidestep_up', 'up']),
      sidestepDownHeld: isHeld(['s', 'keys', 'arrowdown', 'sidestep_down', 'down']),
      jumpJustPressed: isJust([' ', 'space', 'jump', 'up']),
      jumpHeld: isHeld([' ', 'space', 'jump', 'up']),
      crouchHeld: isHeld(['control', 'controlleft', 'controlright', 'ctrl', 'c', 'keyc', 'crouch']),
      blockHeld: isHeld(['shift', 'shiftleft', 'shiftright', 'b', 'keyb', 'block']),
      punchJustPressed: isJust(['j', 'keyj', 'punch']),
      kickJustPressed: isJust(['k', 'keyk', 'kick']),
      grabJustPressed: isJust(['i', 'keyi', 'grab']),
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
      up: snap.sidestepUpHeld,
      down: snap.sidestepDownHeld,
      sidestepUp: snap.sidestepUpHeld,
      sidestepDown: snap.sidestepDownHeld,
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
