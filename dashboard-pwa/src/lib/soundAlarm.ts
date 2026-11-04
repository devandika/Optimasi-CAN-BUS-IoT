// Web Audio API Alarm for Caterpillar 950L Dashboard
// Zero external audio assets, works purely via browser AudioContext oscillator

class SoundAlarmManager {
  private ctx: AudioContext | null = null;
  private currentOsc: OscillatorNode | null = null;
  private currentGain: GainNode | null = null;
  private intervalId: any = null;
  private currentLevel: number = 0;
  private muted: boolean = false;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const savedMute = localStorage.getItem("cat950l-alarm-muted");
        this.muted = savedMute === "true";
      } catch {
        this.muted = false;
      }
    }
  }

  private initCtx() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean) {
    this.muted = mute;
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("cat950l-alarm-muted", String(mute));
      } catch {}
    }
    if (mute) {
      this.stop();
    }
  }

  private playTone(freq: number, durationMs: number, type: OscillatorType = "sine", volume = 0.15) {
    if (this.muted) return;
    this.initCtx();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + durationMs / 1000);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + durationMs / 1000);
    } catch {
      // AudioContext may be blocked before first user interaction
    }
  }

  public updateAlarm(level: number) {
    if (this.currentLevel === level) return;
    this.currentLevel = level;
    this.stop();

    if (this.muted) return;

    if (level === 2) {
      // Warning: Beep lembut intermiten (dua nada 880Hz / 1046Hz setiap 1.2 detik)
      const playWarning = () => {
        this.playTone(880, 150, "sine", 0.12);
        setTimeout(() => this.playTone(1046, 180, "sine", 0.12), 160);
      };
      playWarning();
      this.intervalId = setInterval(playWarning, 1200);
    } else if (level === 3) {
      // Critical Alarm: Nada peringatan darurat berulang cepat (1200Hz - 900Hz setiap 500 ms)
      const playCritical = () => {
        this.playTone(1200, 200, "square", 0.18);
        setTimeout(() => this.playTone(900, 200, "square", 0.18), 220);
      };
      playCritical();
      this.intervalId = setInterval(playCritical, 500);
    }
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

export const soundAlarm = new SoundAlarmManager();
