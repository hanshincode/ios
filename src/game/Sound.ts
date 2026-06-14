export class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private noiseBuffer: AudioBuffer | null = null;
  
  // Ambient Music Timer
  private musicIntervalId: any = null;

  constructor() {
    // AudioContext is created lazily on first user interaction
    const initAudio = () => {
      this.init();
      window.removeEventListener('click', initAudio);
      window.removeEventListener('touchstart', initAudio);
    };
    window.addEventListener('click', initAudio);
    window.addEventListener('touchstart', initAudio);
  }

  private init() {
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.createNoiseBuffer();
      this.startAmbientMusic();
    } catch (err) {
      console.warn("Web Audio API is not supported:", err);
    }
  }

  private createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 0.4; // 0.4 seconds of noise
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  public setMute(muted: boolean) {
    this.muted = muted;
    if (muted) {
      this.stopAmbientMusic();
    } else {
      this.startAmbientMusic();
    }
  }

  public toggleMute(): boolean {
    this.setMute(!this.muted);
    return this.muted;
  }

  public isMuted() {
    return this.muted;
  }

  // Play a synthesized block break sound (low-pass white noise)
  public playBreak() {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, this.ctx.currentTime);
    filter.Q.setValueAtTime(1, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.6, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start();
  }

  // Play a synthesized block place sound (snappy pop)
  public playPlace() {
    if (this.muted || !this.ctx || !this.noiseBuffer) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start();
  }

  // Play a cute retro jump sound (frequency sweep)
  public playJump() {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(280, this.ctx.currentTime + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  // Play a synthesized grunt/damage sound (sweep down sawtooth)
  public playDamage() {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.18);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.18);
  }

  // Play a soft, relaxing ambient chord (piano/synth pad style)
  private playAmbientChord() {
    if (this.muted || !this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const chords = [
      [130.81, 164.81, 196.00, 246.94], // Cmaj7 (C3, E3, G3, B3)
      [174.61, 220.00, 261.63, 329.63], // Fmaj7 (F3, A3, C4, E4)
      [146.83, 174.61, 220.00, 293.66], // Dm7 (D3, F3, A3, D4)
      [196.00, 246.94, 293.66, 392.00]  // G7 (G3, B3, D4, G4)
    ];

    // Pick a random chord
    const notes = chords[Math.floor(Math.random() * chords.length)];
    const now = this.ctx.currentTime;
    
    // Play notes together with a soft envelope
    notes.forEach(freq => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      // Triangle waves sound very soft and pure, like classic ambient pads
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(400, now);

      const gain = this.ctx.createGain();
      
      // Pad envelope: Long attack (3.0s), long sustain, long release (5.0s)
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.02, now + 3.0); // very soft
      gain.gain.setValueAtTime(0.02, now + 8.0);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 13.0);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 13.0);
    });
  }

  private startAmbientMusic() {
    this.stopAmbientMusic();
    if (this.muted) return;

    // Play one chord immediately, then every 25 seconds
    setTimeout(() => this.playAmbientChord(), 3000);
    
    this.musicIntervalId = setInterval(() => {
      this.playAmbientChord();
    }, 25000);
  }

  private stopAmbientMusic() {
    if (this.musicIntervalId) {
      clearInterval(this.musicIntervalId);
      this.musicIntervalId = null;
    }
  }
}

// Global static audio manager instance
export const gameAudio = new SoundManager();
