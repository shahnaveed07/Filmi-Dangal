export class AudioManager {
  private static instance: AudioManager;
  private ctx: AudioContext | null = null;
  public isMuted: boolean = false;
  public isBgmEnabled: boolean = true;
  public masterVolume: number = 0.75;
  private isBgmPlaying: boolean = false;
  private bgmIntervalId: ReturnType<typeof setInterval> | null = null;
  private muteListeners: Set<(isMuted: boolean) => void> = new Set();

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private constructor() {
    // Lazy init on first user interaction
  }

  private initContext(): void {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        try {
          this.ctx = new AudioCtx();
        } catch {
          this.ctx = null;
        }
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public subscribeMute(listener: (isMuted: boolean) => void): () => void {
    this.muteListeners.add(listener);
    return () => this.muteListeners.delete(listener);
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopBgm();
    } else if (this.isBgmEnabled) {
      this.startBgm();
    }
    this.muteListeners.forEach((l) => l(this.isMuted));
    return this.isMuted;
  }

  public toggleBgm(): boolean {
    this.isBgmEnabled = !this.isBgmEnabled;
    if (!this.isBgmEnabled) {
      this.stopBgm();
    } else if (!this.isMuted) {
      this.startBgm();
    }
    return this.isBgmEnabled;
  }

  public playSound(
    type:
      | 'punch'
      | 'kick'
      | 'dishoom'
      | 'block'
      | 'whoosh'
      | 'super'
      | 'ko'
      | 'round'
      | 'fight'
      | 'click'
  ): void {
    if (this.isMuted) return;
    this.initContext();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    try {
      switch (type) {
        case 'click': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, t);
          osc.frequency.exponentialRampToValueAtTime(400, t + 0.05);
          gain.gain.setValueAtTime(0.2 * this.masterVolume, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.05);
          break;
        }

        case 'whoosh': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(280, t);
          osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
          gain.gain.setValueAtTime(0.25 * this.masterVolume, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.12);
          break;
        }

        case 'punch': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, t);
          osc.frequency.exponentialRampToValueAtTime(55, t + 0.1);
          gain.gain.setValueAtTime(0.5 * this.masterVolume, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.12);
          break;
        }

        case 'kick': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(160, t);
          osc.frequency.exponentialRampToValueAtTime(40, t + 0.16);
          gain.gain.setValueAtTime(0.65 * this.masterVolume, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.18);
          break;
        }

        case 'dishoom': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(260, t);
          osc.frequency.exponentialRampToValueAtTime(35, t + 0.35);
          gain.gain.setValueAtTime(0.85 * this.masterVolume, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.35);
          break;
        }

        case 'block': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'square';
          osc.frequency.setValueAtTime(880, t);
          osc.frequency.exponentialRampToValueAtTime(320, t + 0.08);
          gain.gain.setValueAtTime(0.35 * this.masterVolume, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.09);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.09);
          break;
        }

        case 'super': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.linearRampToValueAtTime(950, t + 0.3);
          osc.frequency.exponentialRampToValueAtTime(45, t + 0.6);
          gain.gain.setValueAtTime(0.7 * this.masterVolume, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.6);
          break;
        }

        case 'fight': {
          const freqs = [330, 440, 554, 659];
          freqs.forEach((f, idx) => {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(f, t + idx * 0.07);
            gain.gain.setValueAtTime(0.25 * this.masterVolume, t + idx * 0.07);
            gain.gain.exponentialRampToValueAtTime(0.005, t + idx * 0.07 + 0.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(t + idx * 0.07);
            osc.stop(t + idx * 0.07 + 0.2);
          });
          break;
        }

        case 'ko': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(110, t);
          osc.frequency.exponentialRampToValueAtTime(25, t + 0.8);
          gain.gain.setValueAtTime(0.9 * this.masterVolume, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.8);
          break;
        }

        case 'round': {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, t);
          gain.gain.setValueAtTime(0.3 * this.masterVolume, t);
          gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
          osc.connect(gain);
          gain.connect(this.ctx.destination);
          osc.start(t);
          osc.stop(t + 0.25);
          break;
        }
      }
    } catch {
      // Ignore Web Audio autoplay or context disposal exceptions
    }
  }

  /**
   * Procedural Bollywood 90s arcade fighting battle theme
   */
  public startBgm(): void {
    if (this.isMuted || !this.isBgmEnabled) return;
    // Prevent duplicate BGM timers
    this.stopBgm();
    this.initContext();
    if (!this.ctx) return;

    this.isBgmPlaying = true;
    let step = 0;
    const bassNotes = [110, 110, 146.83, 110, 130.81, 110, 164.81, 146.83];
    const melodyNotes = [440, 523.25, 587.33, 659.25, 587.33, 523.25, 493.88, 440];

    this.bgmIntervalId = setInterval(() => {
      if (this.isMuted || !this.isBgmEnabled || !this.ctx) return;
      try {
        const t = this.ctx.currentTime;

        // 1. Dhol/Kick rhythmic pulse
        const kickOsc = this.ctx.createOscillator();
        const kickGain = this.ctx.createGain();
        kickOsc.type = 'sine';
        kickOsc.frequency.setValueAtTime(step % 2 === 0 ? 120 : 90, t);
        kickOsc.frequency.exponentialRampToValueAtTime(35, t + 0.1);
        kickGain.gain.setValueAtTime(0.3 * this.masterVolume, t);
        kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        kickOsc.connect(kickGain);
        kickGain.connect(this.ctx.destination);
        kickOsc.start(t);
        kickOsc.stop(t + 0.1);

        // 2. Energetic Bass groove
        const bassNote = bassNotes[step % bassNotes.length];
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'sawtooth';
        bassOsc.frequency.setValueAtTime(bassNote / 2, t);
        bassGain.gain.setValueAtTime(0.12 * this.masterVolume, t);
        bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        bassOsc.connect(bassGain);
        bassGain.connect(this.ctx.destination);
        bassOsc.start(t);
        bassOsc.stop(t + 0.15);

        // 3. Arcade Bollywood Brass Lead (on every 2nd step)
        if (step % 2 === 0) {
          const melNote = melodyNotes[(step / 2) % melodyNotes.length];
          const melOsc = this.ctx.createOscillator();
          const melGain = this.ctx.createGain();
          melOsc.type = 'square';
          melOsc.frequency.setValueAtTime(melNote, t);
          melGain.gain.setValueAtTime(0.08 * this.masterVolume, t);
          melGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          melOsc.connect(melGain);
          melGain.connect(this.ctx.destination);
          melOsc.start(t);
          melOsc.stop(t + 0.22);
        }

        step++;
      } catch {
        // Ignore audio errors
      }
    }, 180);
  }

  public stopBgm(): void {
    if (this.bgmIntervalId !== null) {
      clearInterval(this.bgmIntervalId);
      this.bgmIntervalId = null;
    }
    this.isBgmPlaying = false;
  }
}
