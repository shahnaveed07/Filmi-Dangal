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
  debugJustPressed: boolean;
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
    // Prevent default browser scrolling on gameplay navigation keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
      const activeTag =
        typeof document !== 'undefined' ? document.activeElement?.tagName.toLowerCase() : '';
      if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select') {
        e.preventDefault();
      }
    }

    // Ignore OS key auto-repeat for edge-triggered actions
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

  /**
   * Release all held and edge-triggered keyboard and touch inputs
   */
  public clearAll(): void {
    this.heldKeys.clear();
    this.justPressedKeys.clear();
    this.virtualHeld.clear();
    this.virtualJustPressed.clear();
    this.activeTouchPointers.clear();
  }

  /**
   * Release only active touch inputs (e.g. when pausing or hiding mobile controls)
   */
  public clearTouchInputs(): void {
    this.virtualHeld.clear();
    this.virtualJustPressed.clear();
    this.activeTouchPointers.clear();
  }

  // --- PROGRAMMATIC KEY SIMULATION FOR DETERMINISTIC TESTS ---

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

  // --- MOBILE MULTITOUCH API ---

  public onVirtualPointerDown(pointerId: number, control: string): void {
    const normalized = control.toLowerCase();
    // If this pointer was previously on another control, release that control first
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

  public getActiveTouchCount(): number {
    return this.activeTouchPointers.size;
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
      moveLeft: isHeld(['a', 'keya', 'arrowleft', 'left']),
      moveRight: isHeld(['d', 'keyd', 'arrowright', 'right']),
      jumpJustPressed: isJust(['w', 'keyw', 'arrowup', 'up', 'jump']),
      jumpHeld: isHeld(['w', 'keyw', 'arrowup', 'up', 'jump']),
      crouchHeld: isHeld(['s', 'keys', 'arrowdown', 'down', 'crouch']),
      blockHeld: isHeld(['b', 'keyb', 'block']),
      punchJustPressed: isJust(['j', 'keyj', 'punch']),
      kickJustPressed: isJust(['k', 'keyk', 'kick']),
      grabJustPressed: isJust(['i', 'keyi', 'grab']),
      superJustPressed: isJust(['l', 'keyl', ' ', 'space', 'super']),
      pauseJustPressed: isJust(['escape', 'p', 'keyp', 'pause']),
      muteJustPressed: isJust(['m', 'keym', 'mute']),
      debugJustPressed: isJust(['f2', 'h', 'keyh', 'debug']),
    };

    // Clear edge-triggered one-shot keys for next frame
    this.justPressedKeys.clear();
    this.virtualJustPressed.clear();

    return snapshot;
  }
}
