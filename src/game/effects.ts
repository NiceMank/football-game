import { GRAVITY } from './constants';
import { rand } from './math';

export type ParticleKind = 'dust' | 'confetti' | 'spark' | 'ring' | 'net';

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
}

const CAPACITY = 220;

export interface Banner {
  text: string;
  sub: string;
  color: string;
  time: number;
  duration: number;
}

/** Fixed-size particle pool plus screen-level feedback (shake, flash, banners). */
export class Effects {
  readonly particles: Particle[] = [];
  private cursor = 0;
  shake = 0;
  flash = 0;
  flashColor = '#ffffff';
  banner: Banner | null = null;

  constructor() {
    for (let i = 0; i < CAPACITY; i++) {
      this.particles.push({ active: false, kind: 'dust', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, size: 1, color: '#fff', rot: 0 });
    }
  }

  private next() {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % CAPACITY;
    return p;
  }

  emit(kind: ParticleKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: string) {
    const p = this.next();
    p.active = true;
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.max = life;
    p.size = size;
    p.color = color;
    p.rot = Math.random() * Math.PI;
  }

  dust(x: number, y: number, count: number, strength = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(20, 70) * strength;
      this.emit('dust', x, y, 1, Math.cos(a) * s, Math.sin(a) * s, rand(30, 90) * strength, rand(0.25, 0.5), rand(1.5, 3), i % 2 ? '#d9f99d' : '#a3c76a');
    }
  }

  kickRing(x: number, y: number, size: number) {
    this.emit('ring', x, y, 0, 0, 0, 0, 0.32, size, '#ffffff');
  }

  sparks(x: number, y: number, z: number) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      this.emit('spark', x, y, z, Math.cos(a) * rand(80, 200), Math.sin(a) * rand(80, 200), rand(40, 160), rand(0.25, 0.45), rand(1.5, 2.5), '#fef08a');
    }
  }

  confetti(x: number, y: number, colors: readonly string[]) {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(40, 260);
      this.emit('confetti', x + rand(-30, 30), y + rand(-30, 30), rand(10, 60), Math.cos(a) * s, Math.sin(a) * s, rand(200, 460), rand(1.4, 2.6), rand(2.5, 4.5), colors[i % colors.length]);
    }
  }

  netRipple(x: number, y: number, z: number) {
    this.emit('net', x, y, z, 0, 0, 0, 0.6, 30, '#ffffff');
  }

  showBanner(text: string, sub = '', color = '#fbbf24', duration = 1.8) {
    this.banner = { text, sub, color, time: 0, duration };
  }

  addShake(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  addFlash(amount: number, color = '#ffffff') {
    this.flash = Math.max(this.flash, amount);
    this.flashColor = color;
  }

  update(dt: number) {
    this.shake = Math.max(0, this.shake - dt * 18);
    this.flash = Math.max(0, this.flash - dt * 1.8);
    if (this.banner) {
      this.banner.time += dt;
      if (this.banner.time >= this.banner.duration) this.banner = null;
    }
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.kind === 'ring' || p.kind === 'net') continue;
      const drag = p.kind === 'confetti' ? Math.exp(-2.2 * dt) : Math.exp(-3 * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.vz -= (p.kind === 'confetti' ? GRAVITY * 0.35 : GRAVITY * 0.6) * dt;
      if (p.kind === 'confetti') p.vz = Math.max(p.vz, -60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rot += dt * 8;
      if (p.z < 0) {
        p.z = 0;
        p.vz = 0;
        p.vx *= 0.5;
        p.vy *= 0.5;
      }
    }
  }

  clear() {
    for (const p of this.particles) p.active = false;
    this.banner = null;
    this.shake = 0;
    this.flash = 0;
  }
}
