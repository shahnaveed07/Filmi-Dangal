export interface InputSnapshot {
  moveLeft: boolean;
  moveRight: boolean;
  jumpJustPressed: boolean;
  jumpHeld: boolean;
  crouchHeld: boolean;
  blockHeld: boolean;
  punchJustPressed: boolean;
  kickJustPressed: boolean;
  grabJustPressed: boolean;
  superJustPressed: boolean;
  pauseJustPressed: boolean;
  muteJustPressed: boolean;
}

export class InputManager {
  private static instance: InputManager;
  private heldKeys: Set<string> = new Set();
  private justPressedKeys: Set<string> = new Set();

  // Virtual touch controls state (supporting multitouch pointer tracking)
  private activeTouchPointers: Map<number, string> = new Map();
  private virtualHeld: Set<string> = new Set();
  private virtualJustPressed: Set<string> = new Set();

  public static getInstance(): InputManager {
    if (!InputManager.instance) {
      InputManager.instance = new InputManager();
    }
    return InputManager.instance;
  }

  private constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown.bind(this));
      window.addEventListener('keyup', this.handleKeyUp.bind(this));
      window.addEventListener('blur', this.handleBlur.bind(this));
      document.addEventListener('visibilitychange', this.handleBlur.bind(this));
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    // Prevent default scrolling on arrow keys and space during gameplay
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      e.preventDefault();
    }

    const key = e.key.toLowerCase();
    const code = e.code;

    if (!this.heldKeys.has(key) && !this.heldKeys.has(code)) {
      this.justPressedKeys.add(key);
      this.justPressedKeys.add(code);
    }
    this.heldKeys.add(key);
    this.heldKeys.add(code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const key = e.key.toLowerCase();
    const code = e.code;
    this.heldKeys.delete(key);
    this.heldKeys.delete(code);
  }

  public handleBlur(): void {
    this.heldKeys.clear();
    this.justPressedKeys.clear();
    this.virtualHeld.clear();
    this.virtualJustPressed.clear();
    this.activeTouchPointers.clear();
  }

  // --- MOBILE MULTITOUCH API ---

  public onVirtualPointerDown(pointerId: number, control: string): void {
    this.activeTouchPointers.set(pointerId, control);
    if (!this.virtualHeld.has(control)) {
      this.virtualJustPressed.add(control);
    }
    this.virtualHeld.add(control);
  }

  public onVirtualPointerUp(pointerId: number): void {
    const control = this.activeTouchPointers.get(pointerId);
    if (control) {
      this.activeTouchPointers.delete(pointerId);
      // Only remove from virtualHeld if no other active pointer is holding this same control
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

  /**
   * Produce 60Hz input snapshot and clear one-shot justPressed flags
   */
  public pollSnapshot(): InputSnapshot {
    const isHeld = (keys: string[]): boolean => {
      return keys.some((k) => this.heldKeys.has(k) || this.virtualHeld.has(k));
    };

    const isJust = (keys: string[]): boolean => {
      return keys.some((k) => this.justPressedKeys.has(k) || this.virtualJustPressed.has(k));
    };

    const snapshot: InputSnapshot = {
      moveLeft: isHeld(['a', 'arrowleft', 'left']),
      moveRight: isHeld(['d', 'arrowright', 'right']),
      jumpJustPressed: isJust(['w', 'arrowup', 'up']),
      jumpHeld: isHeld(['w', 'arrowup', 'up']),
      crouchHeld: isHeld(['s', 'arrowdown', 'down']),
      blockHeld: isHeld(['b', 'block']),
      punchJustPressed: isJust(['j', 'punch']),
      kickJustPressed: isJust(['k', 'kick']),
      grabJustPressed: isJust(['i', 'grab']),
      superJustPressed: isJust(['l', 'space', 'super']),
      pauseJustPressed: isJust(['escape', 'p', 'pause']),
      muteJustPressed: isJust(['m', 'mute']),
    };

    // Clear edge-triggered one-shot keys for next frame
    this.justPressedKeys.clear();
    this.virtualJustPressed.clear();

    return snapshot;
  }
}
