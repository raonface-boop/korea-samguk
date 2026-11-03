// 소리: 외부 파일 없이 Web Audio API 로 직접 만든 국악풍 음악과 효과음
import type { Settings } from '../game/save';

export type BgmMode = 'map' | 'battle' | null;
export type Sfx = 'click' | 'gong' | 'march' | 'fanfare' | 'warn';

// 궁·상·각·치·우 (D·E·G·A·B)
const PENTA = [0, 2, 5, 7, 9];
const midiFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** 음계 단계 → 진동수 (0 = D4) */
function degreeFreq(deg: number): number {
  const oct = Math.floor(deg / 5);
  const i = ((deg % 5) + 5) % 5;
  return midiFreq(62 + oct * 12 + PENTA[i]);
}

/** 고정된 씨앗으로 만든 선율 (매번 같은 곡) */
function makeMelody(seed: number, beats: number, step: number): (number | null)[] {
  let x = seed;
  const rnd = () => {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    return x / 0x7fffffff;
  };
  const out: (number | null)[] = [];
  let deg = 2;
  const n = Math.round(beats / step);
  for (let i = 0; i < n; i++) {
    // 구절 끝(8박마다)은 쉬거나 궁음으로 맺음
    const pos = (i * step) % 8;
    if (pos >= 7 && rnd() < 0.6) {
      out.push(rnd() < 0.5 ? null : 0);
      continue;
    }
    if (rnd() < 0.18) {
      out.push(null);
      continue;
    }
    const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(rnd() * 7)];
    deg = Math.max(-3, Math.min(7, deg + move));
    out.push(deg);
  }
  return out;
}

// 지도: 느리게 (한 박 = 1초, 36박 = 36초 한 바퀴)
const MAP_TEMPO = 1.0;
const MAP_MELODY = makeMelody(7, 36, 1);
// 전투: 같은 음계로 빠르게 (한 박 = 0.42초, 반박마다 음)
const BATTLE_TEMPO = 0.42;
const BATTLE_MELODY = makeMelody(31, 32, 0.5);

class SoundEngine {
  private ctx: AudioContext | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private settings: Settings | null = null;
  private mode: BgmMode = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private drone: OscillatorNode[] = [];
  private droneGain: GainNode | null = null;

  /** 첫 클릭 뒤에 호출 */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.bgmGain.connect(this.ctx.destination);
      this.sfxGain.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applySettings();
      const m = this.mode;
      this.mode = null;
      this.setMode(m);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready() {
    return !!this.ctx;
  }

  setSettings(st: Settings) {
    this.settings = st;
    this.applySettings();
  }

  private applySettings() {
    if (!this.ctx || !this.settings) return;
    const t = this.ctx.currentTime;
    this.bgmGain!.gain.setTargetAtTime(this.settings.bgm ? this.settings.bgmVolume * 0.5 : 0, t, 0.1);
    this.sfxGain!.gain.setTargetAtTime(this.settings.sfx ? this.settings.sfxVolume : 0, t, 0.05);
  }

  setMode(mode: BgmMode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!this.ctx) return;
    this.stopLoop();
    if (!mode) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.startDrone(mode === 'battle' ? 0.035 : 0.05);
    this.timer = window.setInterval(() => this.schedule(), 100);
  }

  private stopLoop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    if (this.ctx && this.droneGain) {
      const g = this.droneGain;
      const oscs = this.drone;
      g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
      window.setTimeout(() => oscs.forEach((o) => o.stop()), 1500);
    }
    this.drone = [];
    this.droneGain = null;
  }

  /** 낮은 지속음 (D2 + A2) */
  private startDrone(level: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(level, ctx.currentTime, 1.2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 400;
    g.connect(lp).connect(this.bgmGain!);
    for (const m of [38, 45]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiFreq(m);
      o.detune.value = m === 38 ? -4 : 4;
      o.connect(g);
      o.start();
      this.drone.push(o);
    }
    this.droneGain = g;
  }

  private schedule() {
    if (!this.ctx || !this.mode) return;
    const battle = this.mode === 'battle';
    const melody = battle ? BATTLE_MELODY : MAP_MELODY;
    const beat = battle ? BATTLE_TEMPO : MAP_TEMPO;
    const stepBeats = battle ? 0.5 : 1;
    const dur = beat * stepBeats;
    while (this.nextTime < this.ctx.currentTime + 0.35) {
      const i = this.step % melody.length;
      const deg = melody[i];
      const t = this.nextTime;
      if (deg !== null) {
        this.pluck(degreeFreq(deg), t, battle ? 0.5 : 1.6, battle ? 0.22 : 0.28, this.bgmGain!);
        // 가끔 옥타브 아래 겹음
        if (!battle && i % 4 === 0) this.pluck(degreeFreq(deg) / 2, t, 1.8, 0.12, this.bgmGain!);
      }
      const beatIndex = (this.step * stepBeats) % 64;
      if (battle) {
        if (beatIndex % 2 === 0) this.drum(t, true, 0.7, this.bgmGain!);
        else if (this.step % 2 === 1 && Math.random() < 0.3) this.drum(t, false, 0.25, this.bgmGain!);
      } else if (beatIndex % 4 === 0) {
        this.drum(t, false, 0.35, this.bgmGain!);
      }
      this.nextTime += dur;
      this.step++;
    }
  }

  private noise(t: number, dur: number, gain: number, filterType: BiquadFilterType, freq: number, q: number, out: AudioNode) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.5, dur + 0.05);
  }

  /** 가야금처럼 튕기는 소리: 짧게 감쇠하는 삼각파 + 약간의 잡음 */
  private pluck(freq: number, t: number, dur: number, gain: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq * 1.01, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    // 농현(떨림)
    const lfo = ctx.createOscillator();
    const lg = ctx.createGain();
    lfo.frequency.value = 5;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(freq * 0.008, t + dur * 0.6);
    lfo.connect(lg).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
    this.noise(t, 0.03, gain * 0.4, 'bandpass', freq * 3, 2, out);
  }

  /** 북: 음높이가 떨어지는 사인파 + 잡음 */
  private drum(t: number, big: boolean, gain: number, out: AudioNode) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(big ? 110 : 180, t);
    o.frequency.exponentialRampToValueAtTime(big ? 45 : 90, t + (big ? 0.35 : 0.15));
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.6 : 0.25));
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.7);
    this.noise(t, big ? 0.12 : 0.06, gain * 0.35, 'lowpass', big ? 600 : 1500, 0.7, out);
  }

  play(kind: Sfx) {
    if (!this.ctx || !this.settings?.sfx) return;
    const ctx = this.ctx;
    const out = this.sfxGain!;
    const t = ctx.currentTime + 0.01;
    switch (kind) {
      case 'click': {
        // 나무 딱따기
        this.noise(t, 0.04, 0.5, 'bandpass', 2200, 6, out);
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(950, t);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.25, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.08);
        break;
      }
      case 'gong': {
        // 징: 어긋난 배음이 길게 울림
        const partials = [
          [98, 0.5],
          [196.5, 0.25],
          [263, 0.18],
          [331, 0.1],
          [411, 0.06],
        ];
        for (const [f, a] of partials) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(f * 1.02, t);
          o.frequency.exponentialRampToValueAtTime(f, t + 0.4);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(a * 0.6, t + 0.03);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
          o.connect(g).connect(out);
          o.start(t);
          o.stop(t + 3.1);
        }
        this.noise(t, 0.08, 0.2, 'lowpass', 800, 0.7, out);
        break;
      }
      case 'march':
        // 북 세 번
        this.drum(t, true, 0.9, out);
        this.drum(t + 0.35, true, 0.9, out);
        this.drum(t + 0.7, true, 1.0, out);
        break;
      case 'fanfare': {
        // 나발: 거친 소리로 올라가는 음
        const notes = [62, 69, 74, 74];
        notes.forEach((m, i) => {
          const st = t + i * 0.28;
          const len = i === notes.length - 1 ? 0.9 : 0.26;
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(midiFreq(m) * 0.97, st);
          o.frequency.linearRampToValueAtTime(midiFreq(m), st + 0.06);
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 1400;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, st);
          g.gain.linearRampToValueAtTime(0.25, st + 0.04);
          g.gain.setValueAtTime(0.25, st + len - 0.05);
          g.gain.linearRampToValueAtTime(0.0001, st + len);
          o.connect(lp).connect(g).connect(out);
          o.start(st);
          o.stop(st + len + 0.02);
        });
        break;
      }
      case 'warn': {
        // 짧은 꽹과리
        for (let k = 0; k < 3; k++) {
          const st = t + k * 0.13;
          for (const f of [1180, 1730, 2510]) {
            const o = ctx.createOscillator();
            o.type = 'square';
            o.frequency.value = f;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.06, st);
            g.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);
            o.connect(g).connect(out);
            o.start(st);
            o.stop(st + 0.14);
          }
          this.noise(st, 0.08, 0.15, 'highpass', 3000, 0.7, out);
        }
        break;
      }
    }
  }
}

export const sound = new SoundEngine();
