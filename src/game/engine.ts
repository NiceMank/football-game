// eFootball Striker — core engine v2 (logic + canvas rendering)
export const W = 480;
export const H = 720;
const GOAL_W = 180;
const GOAL_D = 26;
const GOAL_Y = 60;

export type Phase = 'start' | 'playing' | 'paused' | 'over';
export type Difficulty = 'amateur' | 'pro' | 'legende';

export interface Input { dx: number; dy: number; shoot: boolean; dash: boolean }

export interface HudState {
  score: number; time: number; combo: number; comboTimer: number; goals: number; level: number;
  power: number; charging: boolean; perfect: boolean; stamina: number;
  effects: { x2: number; speed: number; magnet: number };
}
export interface Stats { score: number; goals: number; shots: number; onTarget: number; powerShots: number; bestCombo: number; dodges: number; level: number }

export const DIFFICULTY: Record<Difficulty, { label: string; time: number; keeper: number; def: number; defenders: number; mul: number; desc: string }> = {
  amateur: { label: 'AMATEUR', time: 75, keeper: 195, def: 0.85, defenders: 2, mul: 0.8, desc: 'Défense lente, gardien généreux' },
  pro: { label: 'PRO', time: 60, keeper: 255, def: 1, defenders: 3, mul: 1, desc: 'Le réglage standard du stade' },
  legende: { label: 'LÉGENDE', time: 55, keeper: 315, def: 1.25, defenders: 4, mul: 1.5, desc: 'Pressing total, angles fermés' },
};

interface Vec { x: number; y: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav?: number }
interface FloatText { x: number; y: number; text: string; life: number; color: string; size: number }
interface Defender { x: number; y: number; vx: number; vy: number; speed: number; stun: number; ang: number }
interface Pickup { x: number; y: number; type: 'time' | 'x2' | 'speed' | 'magnet'; life: number; t: number }

const WAVE_NAMES = ['MISE EN JEU', 'PRESSING', 'CONTRE-ATTAQUE', 'BARRAGE', 'TEMPS ADDITIONNEL', 'LÉGENDE', 'MARATHON'];
export const waveName = (lvl: number) => WAVE_NAMES[Math.min(lvl - 1, WAVE_NAMES.length - 1)];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const len = (x: number, y: number) => Math.hypot(x, y) || 0.0001;

export class Game {
  phase: Phase = 'start';
  diff: Difficulty = 'pro';
  score = 0; goals = 0; combo = 0; comboTimer = 0; time = 60; level = 1;
  stats: Stats = { score: 0, goals: 0, shots: 0, onTarget: 0, powerShots: 0, bestCombo: 0, dodges: 0, level: 1 };
  player: Vec & { vx: number; vy: number; ang: number; step: number } = { x: W / 2, y: H - 150, vx: 0, vy: 0, ang: -Math.PI / 2, step: 0 };
  ball: Vec & { vx: number; vy: number; owner: 'player' | 'none'; spin: number } = { x: W / 2, y: H - 190, vx: 0, vy: 0, owner: 'none', spin: 0 };
  keeper = { x: W / 2, y: GOAL_Y + GOAL_D + 14, vx: 0, dive: 0, diveDir: 0 };
  defenders: Defender[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  texts: FloatText[] = [];
  trail: { x: number; y: number; life: number }[] = [];
  shake = 0; shakeX = 0; shakeY = 0;
  flash = 0; flashColor = '255,255,255'; banner = { text: '', life: 0, color: '#fff', sub: '' };
  power = 0; charging = false; prevShoot = false; prevDash = false; pendingShoot = false;
  stamina = 100; dashTimer = 0; dashCd = 0; dashAng = 0;
  speedBoost = 0; magnet = 0; x2 = 0;
  kickCd = 0; freeze = 0; resetTimer = 0; tick = 0; pickupTimer = 6; perfectShot = false;
  onEnd?: (s: Stats) => void;
  sfx?: (name: string) => void;

  start(diff: Difficulty) {
    this.diff = diff;
    const cfg = DIFFICULTY[diff];
    this.phase = 'playing';
    this.score = 0; this.goals = 0; this.combo = 0; this.comboTimer = 0; this.time = cfg.time; this.level = 1;
    this.stats = { score: 0, goals: 0, shots: 0, onTarget: 0, powerShots: 0, bestCombo: 0, dodges: 0, level: 1 };
    this.particles = []; this.texts = []; this.trail = []; this.pickups = [];
    this.shake = 0; this.flash = 0; this.freeze = 0; this.resetTimer = 0;
    this.stamina = 100; this.dashTimer = 0; this.dashCd = 0;
    this.speedBoost = 0; this.magnet = 0; this.x2 = 0; this.pickupTimer = 6;
    this.spawnDefenders();
    this.resetPositions(true);
    this.showBanner('COUP D’ENVOI !', '#ffd166', cfg.label);
  }

  private spawnDefenders() {
    const cfg = DIFFICULTY[this.diff];
    const n = Math.min(cfg.defenders + Math.floor((this.level - 1) / 2), 6);
    this.defenders = [];
    for (let i = 0; i < n; i++) {
      this.defenders.push({ x: rand(60, W - 60), y: rand(180, 380), vx: 0, vy: 0, speed: (112 + this.level * 9 + rand(-10, 10)) * cfg.def, stun: 0, ang: 0 });
    }
  }

  private resetPositions(full = false) {
    this.player.x = W / 2; this.player.y = H - 150; this.player.vx = this.player.vy = 0; this.player.ang = -Math.PI / 2;
    this.ball.x = W / 2; this.ball.y = H - 200; this.ball.vx = this.ball.vy = 0; this.ball.owner = 'none';
    this.keeper.x = W / 2; this.keeper.dive = 0;
    this.power = 0; this.charging = false;
    this.defenders.forEach((d, i) => {
      d.x = W / 2 + (i - (this.defenders.length - 1) / 2) * 90 + rand(-15, 15);
      d.y = full ? rand(220, 380) : rand(200, 400);
      d.vx = d.vy = 0; d.stun = 0.6;
    });
  }

  showBanner(text: string, color: string, sub = '') { this.banner = { text, life: 1.5, color, sub }; }
  addShake(a: number) { this.shake = Math.min(this.shake + a, 24); }

  burst(x: number, y: number, n: number, colors: string[], speed = 220, grav = 0, size = 4) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 420) break;
      const a = rand(0, Math.PI * 2), s = rand(speed * 0.3, speed);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, max: rand(0.4, 0.9), size: rand(size * 0.5, size * 1.3), color: colors[(Math.random() * colors.length) | 0], grav });
    }
  }
  float(x: number, y: number, text: string, color = '#fff', size = 22) { this.texts.push({ x, y, text, life: 1, color, size }); }

  togglePause() { if (this.phase === 'playing') this.phase = 'paused'; else if (this.phase === 'paused') this.phase = 'playing'; }

  hud(): HudState {
    return {
      score: this.score, time: this.time, combo: this.combo, comboTimer: this.comboTimer, goals: this.goals, level: this.level,
      power: this.power, charging: this.charging, perfect: this.perfectShot, stamina: this.stamina,
      effects: { x2: this.x2, speed: this.speedBoost, magnet: this.magnet },
    };
  }

  update(dt: number, input: Input) {
    this.tick += dt;
    this.shake *= Math.pow(0.02, dt);
    this.shakeX = (Math.random() - 0.5) * this.shake * 2;
    this.shakeY = (Math.random() - 0.5) * this.shake * 2;
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.banner.life -= dt;
    this.updateParticles(dt);
    if (this.phase !== 'playing') return;
    if (this.freeze > 0) { this.freeze -= dt; return; }
    if (this.resetTimer > 0) {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0) this.resetPositions();
      return;
    }

    const cfg = DIFFICULTY[this.diff];
    this.time -= dt;
    if (this.time <= 0) { this.time = 0; this.endGame(); return; }
    this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0;
    this.kickCd -= dt; this.dashCd -= dt; this.dashTimer -= dt;
    this.speedBoost = Math.max(0, this.speedBoost - dt);
    this.magnet = Math.max(0, this.magnet - dt);
    this.x2 = Math.max(0, this.x2 - dt);
    this.stamina = Math.min(100, this.stamina + dt * 17);
    this.perfectShot = this.charging && this.power >= 0.82;

    const p = this.player, b = this.ball;
    // --- Movement
    const il = len(input.dx, input.dy);
    const tx = il > 1 ? input.dx / il : input.dx, ty = il > 1 ? input.dy / il : input.dy;
    const moving = il > 0.12;
    if (input.dash && !this.prevDash && this.dashCd <= 0 && this.stamina > 28 && moving) {
      this.dashTimer = 0.22; this.dashCd = 0.75; this.stamina -= 28; this.dashAng = Math.atan2(ty, tx);
      this.addShake(4); this.sfx?.('dash');
      for (let i = 0; i < 8; i++) this.trail.push({ x: p.x, y: p.y, life: 1 });
    }
    this.prevDash = input.dash;

    const boosting = this.speedBoost > 0 ? 1.32 : 1;
    let speed = (this.charging ? 132 : 232) * boosting;
    if (this.dashTimer > 0) speed = 620 * boosting;
    const dirX = this.dashTimer > 0 ? Math.cos(this.dashAng) : tx, dirY = this.dashTimer > 0 ? Math.sin(this.dashAng) : ty;
    const accel = this.dashTimer > 0 ? 30 : 14;
    p.vx += (dirX * speed - p.vx) * Math.min(1, accel * dt);
    p.vy += (dirY * speed - p.vy) * Math.min(1, accel * dt);
    p.x = clamp(p.x + p.vx * dt, 18, W - 18);
    p.y = clamp(p.y + p.vy * dt, GOAL_Y + GOAL_D + 40, H - 30);
    if (len(p.vx, p.vy) > 20) {
      const target = Math.atan2(p.vy, p.vx);
      let d = target - p.ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      p.ang += d * Math.min(1, 16 * dt);
      p.step += len(p.vx, p.vy) * dt * 0.06;
    }
    if (this.dashTimer > 0 && Math.random() < 0.6) this.trail.push({ x: p.x, y: p.y, life: 1 });
    for (let i = this.trail.length - 1; i >= 0; i--) { this.trail[i].life -= dt * 3.2; if (this.trail[i].life <= 0) this.trail.splice(i, 1); }

    // --- Ball
    if (b.owner === 'player') {
      const off = this.charging ? 14 : 20;
      const gx = p.x + Math.cos(p.ang) * off, gy = p.y + Math.sin(p.ang) * off;
      b.x += (gx - b.x) * Math.min(1, 18 * dt); b.y += (gy - b.y) * Math.min(1, 18 * dt);
      b.vx = p.vx; b.vy = p.vy; b.spin += len(p.vx, p.vy) * dt * 0.05;
    } else {
      if (this.magnet > 0) {
        const dx = p.x - b.x, dy = p.y - b.y, dl = len(dx, dy);
        if (dl < 340) { b.vx += (dx / dl) * 620 * dt; b.vy += (dy / dl) * 620 * dt; }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      const fr = Math.pow(0.35, dt); b.vx *= fr; b.vy *= fr;
      b.spin += len(b.vx, b.vy) * dt * 0.05;
      if (b.x < 10) { b.x = 10; b.vx = Math.abs(b.vx) * 0.7; this.addShake(2); }
      if (b.x > W - 10) { b.x = W - 10; b.vx = -Math.abs(b.vx) * 0.7; this.addShake(2); }
      if (b.y > H - 10) { b.y = H - 10; b.vy = -Math.abs(b.vy) * 0.7; }
      const inGoalX = b.x > W / 2 - GOAL_W / 2 && b.x < W / 2 + GOAL_W / 2;
      if (b.y < GOAL_Y + GOAL_D) {
        if (inGoalX) { if (b.y < GOAL_Y + GOAL_D - 8) this.scoreGoal(); }
        else { b.y = GOAL_Y + GOAL_D; b.vy = Math.abs(b.vy) * 0.6; this.addShake(3); this.burst(b.x, b.y, 8, ['#fff', '#ddd'], 120); }
      }
      for (const px of [W / 2 - GOAL_W / 2, W / 2 + GOAL_W / 2]) {
        const dx = b.x - px, dy = b.y - (GOAL_Y + GOAL_D);
        if (len(dx, dy) < 14 && b.y < GOAL_Y + GOAL_D + 14) {
          const n = len(dx, dy); const nx = dx / n, ny = dy / n;
          const dot = b.vx * nx + b.vy * ny;
          b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny; b.vx *= 0.8; b.vy *= 0.8;
          b.x = px + nx * 15; b.y = GOAL_Y + GOAL_D + ny * 15;
          this.addShake(9); this.sfx?.('post'); this.stats.onTarget++; this.float(b.x, b.y - 20, 'POTEAU !', '#ff6b6b', 20);
          this.burst(b.x, b.y, 16, ['#fff', '#ffd166'], 210);
        }
      }
      if (this.kickCd <= 0 && len(b.x - p.x, b.y - p.y) < (this.dashTimer > 0 ? 34 : 24)) {
        b.owner = 'player'; this.sfx?.('touch');
        this.burst(b.x, b.y, 5, ['#a7f3d0', '#fff'], 80, 0, 2.5);
      }
    }

    // --- Shooting
    const shootDown = input.shoot || this.pendingShoot;
    this.pendingShoot = false;
    if (b.owner === 'player') {
      if (shootDown) { this.charging = true; this.power = Math.min(1, this.power + dt * 1.45); }
      else if (this.prevShoot && this.charging) this.shoot();
    } else { this.charging = false; this.power = 0; }
    this.prevShoot = shootDown;

    // --- Keeper
    const k = this.keeper;
    const ballToGoal = b.owner === 'none' && b.vy < -50;
    let targetX = W / 2 + (b.x - W / 2) * 0.55;
    if (ballToGoal) { const t = (k.y - b.y) / b.vy; targetX = b.x + b.vx * t; }
    targetX = clamp(targetX, W / 2 - GOAL_W / 2 + 18, W / 2 + GOAL_W / 2 - 18);
    const kspeed = cfg.keeper + this.level * 12;
    const kd = targetX - k.x;
    k.x += clamp(kd, -kspeed * dt, kspeed * dt); k.vx = kd;
    k.dive = Math.max(0, k.dive - dt * 1.8);
    if (b.owner === 'none' && len(b.x - k.x, b.y - k.y) < 23 && b.vy < 0 && this.kickCd <= 0) {
      const difficulty = clamp(len(b.vx, b.vy) / 900, 0, 1);
      if (Math.random() < 0.62 - difficulty * 0.45) {
        b.vy = Math.abs(b.vy) * 0.55 + 130; b.vx = (b.x - k.x) * 8 + rand(-70, 70);
        b.y = k.y + 26; k.dive = 1; k.diveDir = Math.sign(b.vx) || 1;
        this.stats.onTarget++;
        this.addShake(8); this.sfx?.('save'); this.float(k.x, k.y - 32, 'ARRÊT', '#fca5a5', 20);
        this.burst(b.x, b.y, 18, ['#fca5a5', '#fff'], 190);
        this.combo = 0; this.kickCd = 0.18;
      }
    }

    // --- Defenders
    for (const d of this.defenders) {
      d.stun -= dt;
      const chaseX = b.owner === 'player' ? p.x : b.x, chaseY = b.owner === 'player' ? p.y : b.y;
      let dx = chaseX - d.x, dy = chaseY - d.y; const dl = len(dx, dy);
      const sp = d.stun > 0 ? 0 : d.speed;
      d.vx += ((dx / dl) * sp - d.vx) * Math.min(1, 5 * dt);
      d.vy += ((dy / dl) * sp - d.vy) * Math.min(1, 5 * dt);
      for (const o of this.defenders) if (o !== d) {
        const ox = d.x - o.x, oy = d.y - o.y, ol = len(ox, oy);
        if (ol < 36) { d.vx += (ox / ol) * 220 * dt; d.vy += (oy / ol) * 220 * dt; }
      }
      d.x = clamp(d.x + d.vx * dt, 16, W - 16);
      d.y = clamp(d.y + d.vy * dt, GOAL_Y + GOAL_D + 30, H - 40);
      if (len(d.vx, d.vy) > 10) d.ang = Math.atan2(d.vy, d.vx);
      const dist = len(d.x - p.x, d.y - p.y);
      // dash dodge
      if (dist < 30 && this.dashTimer > 0 && d.stun <= 0) {
        d.stun = 1.1; d.vx += (d.x - p.x) * 6; d.vy += (d.y - p.y) * 6;
        const pts = 15 * (this.x2 > 0 ? 2 : 1); this.score += pts; this.stats.dodges++;
        this.float(p.x, p.y - 34, `ESQUIVE +${pts}`, '#a7f3d0', 17);
        this.burst(d.x, d.y, 14, ['#a7f3d0', '#fff', '#22d3ee'], 200);
        this.addShake(5); this.sfx?.('dodge');
      }
      if (d.stun <= 0 && b.owner === 'player' && dist < 26 && this.dashTimer <= 0) {
        b.owner = 'none'; const a = Math.atan2(b.y - d.y, b.x - d.x) + rand(-0.6, 0.6);
        b.vx = Math.cos(a) * 270; b.vy = Math.sin(a) * 270; this.kickCd = 0.4; d.stun = 0.5;
        this.addShake(7); this.sfx?.('tackle'); this.flash = 0.3; this.combo = 0;
        this.float(p.x, p.y - 32, 'TACLÉ !', '#f87171', 18);
        this.burst(p.x, p.y, 14, ['#f87171', '#fff'], 170);
      }
      if (b.owner === 'none' && d.stun <= 0 && len(d.x - b.x, d.y - b.y) < 18 && this.kickCd > 0) {
        const a = Math.atan2(rand(0.3, 1), rand(-1, 1));
        b.vx = Math.cos(a) * 300; b.vy = Math.abs(Math.sin(a)) * 300; d.stun = 0.4; this.sfx?.('touch');
      }
    }

    // --- Power-ups
    this.pickupTimer -= dt;
    if (this.pickupTimer <= 0 && this.pickups.length < 2) {
      this.pickupTimer = rand(8, 12);
      const types: Pickup['type'][] = ['time', 'x2', 'speed', 'magnet'];
      const type = types[(Math.random() * types.length) | 0];
      this.pickups.push({ x: rand(60, W - 60), y: rand(170, H - 180), type, life: 12, t: 0 });
    }
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const q = this.pickups[i]; q.life -= dt; q.t += dt;
      if (q.life <= 0) { this.pickups.splice(i, 1); continue; }
      if (len(q.x - p.x, q.y - p.y) < 32) {
        this.pickups.splice(i, 1); this.sfx?.('power');
        this.burst(q.x, q.y, 26, ['#ffd166', '#fff', '#22d3ee'], 260, 120, 4);
        this.addShake(5);
        if (q.type === 'time') { this.time = Math.min(99, this.time + 6); this.float(q.x, q.y, '+6 SECONDES', '#a7f3d0', 18); }
        if (q.type === 'x2') { this.x2 = 10; this.float(q.x, q.y, 'SCORE x2', '#f472b6', 18); }
        if (q.type === 'speed') { this.speedBoost = 8; this.float(q.x, q.y, 'VITESSE +', '#22d3ee', 18); }
        if (q.type === 'magnet') { this.magnet = 8; this.float(q.x, q.y, 'AIMANT', '#c084fc', 18); }
      }
    }
  }

  private shoot() {
    const b = this.ball, p = this.player;
    const pw = 0.35 + this.power * 0.65;
    const perfect = this.power >= 0.82;
    const spd = 430 + pw * 520 + (perfect ? 120 : 0);
    let ang = p.ang;
    const toGoal = Math.atan2(GOAL_Y - p.y, W / 2 - p.x);
    let d = toGoal - ang; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 0.9) ang += d * 0.35;
    b.owner = 'none'; b.vx = Math.cos(ang) * spd; b.vy = Math.sin(ang) * spd;
    b.x = p.x + Math.cos(ang) * 22; b.y = p.y + Math.sin(ang) * 22;
    this.kickCd = 0.25; this.charging = false; this.power = 0;
    this.stats.shots++; if (perfect) this.stats.powerShots++;
    this.perfectShot = false;
    this.addShake(perfect ? 14 : 3 + pw * 6);
    this.sfx?.(perfect ? 'power' : 'kick');
    if (perfect) { this.flash = 0.55; this.flashColor = '255,209,102'; this.freeze = 0.06; this.showBanner('TIR PARFAIT !', '#ffd166', ''); }
    this.burst(b.x, b.y, perfect ? 30 : 10 + (pw * 12) | 0, perfect ? ['#ffd166', '#fff', '#f472b6'] : ['#fff', '#ffd166', '#a7f3d0'], 200 * pw + 80, 0, perfect ? 5 : 3);
    p.vx -= Math.cos(ang) * 130 * pw; p.vy -= Math.sin(ang) * 130 * pw;
  }

  private scoreGoal() {
    const b = this.ball;
    this.goals++; this.stats.goals++;
    this.combo++; this.comboTimer = 13;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
    const dist = clamp((H - 150 - this.player.y) / 100, 0, 5);
    const basePts = 100 + Math.round(dist) * 25;
    let pts = basePts * this.combo * DIFFICULTY[this.diff].mul;
    if (this.x2 > 0) pts *= 2;
    pts = Math.round(pts);
    this.score += pts;
    this.time = Math.min(99, this.time + 4);
    if (this.goals % 3 === 0) {
      this.level++; this.stats.level = this.level; this.spawnDefenders();
      this.showBanner(`NIVEAU ${this.level} — ${waveName(this.level)}`, '#22d3ee', '');
    } else this.showBanner(this.combo > 1 ? `BUT ! x${this.combo}` : 'BUT !', '#ffd166', this.x2 > 0 ? 'x2 ACTIF' : '');
    this.float(b.x, b.y + 40, `+${pts}`, '#ffd166', 32);
    this.float(W / 2, H / 2 + 70, '+4s', '#a7f3d0', 20);
    this.addShake(18); this.flash = 1; this.flashColor = '255,255,255'; this.freeze = 0.12; this.resetTimer = 1.4;
    this.stats.onTarget++;
    this.sfx?.('goal');
    this.burst(b.x, b.y, 60, ['#ffd166', '#fff', '#22d3ee', '#f472b6', '#a3e635'], 430, 500, 5);
    this.burst(W / 2, H / 2, 40, ['#ffd166', '#fff', '#22d3ee', '#f472b6'], 320, 320, 4);
    b.vx *= 0.1; b.vy *= 0.05; b.y = GOAL_Y + 8;
  }

  private endGame() {
    this.phase = 'over';
    this.stats.score = this.score;
    this.showBanner('COUP DE SIFFLET FINAL', '#fff', '');
    this.addShake(6); this.sfx?.('whistle');
    this.onEnd?.({ ...this.stats });
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i];
      q.life -= dt / q.max; if (q.life <= 0) { this.particles.splice(i, 1); continue; }
      q.vy += (q.grav || 0) * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.pow(0.1, dt); q.vy *= Math.pow(0.3, dt);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.life -= dt * 0.9; t.y -= 42 * dt; if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  // ---------------- RENDER ----------------
  render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.translate(this.shakeX, this.shakeY);
    this.drawPitch(ctx);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    const sh = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.ellipse(x + 3, y + 6, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill(); };
    sh(this.player.x, this.player.y, 14); this.defenders.forEach(d => sh(d.x, d.y, 14)); sh(this.keeper.x, this.keeper.y, 16); sh(this.ball.x, this.ball.y, 7);

    // pickups
    for (const q of this.pickups) this.drawPickup(ctx, q);
    // dash trail
    for (const t of this.trail) {
      ctx.globalAlpha = t.life * 0.35; ctx.fillStyle = '#7dd3fc';
      ctx.beginPath(); ctx.arc(t.x, t.y, 13 * t.life, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    this.drawPlayer(ctx, this.keeper.x, this.keeper.y, Math.PI / 2, '#f59e0b', '#7c2d12', 0, this.keeper.dive * this.keeper.diveDir);
    for (const d of this.defenders) this.drawPlayer(ctx, d.x, d.y, d.ang, '#ef4444', '#7f1d1d', this.tick * 10, 0, d.stun > 0);

    if (this.charging) {
      const p = this.player;
      // perfect zone marker
      ctx.beginPath(); ctx.arc(p.x, p.y, 26, -Math.PI / 2 + 0.82 * Math.PI * 2, -Math.PI / 2 + Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,209,102,0.55)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.arc(p.x, p.y, 26, -Math.PI / 2, -Math.PI / 2 + this.power * Math.PI * 2);
      ctx.strokeStyle = this.perfectShot ? '#f472b6' : '#ffd166'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + Math.cos(p.ang) * (40 + this.power * 90), p.y + Math.sin(p.ang) * (40 + this.power * 90));
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.stroke(); ctx.setLineDash([]);
    }
    if (this.speedBoost > 0) {
      ctx.globalAlpha = 0.25 + Math.sin(this.tick * 12) * 0.1; ctx.fillStyle = '#22d3ee';
      ctx.beginPath(); ctx.arc(this.player.x, this.player.y, 22, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    }
    if (this.magnet > 0) {
      ctx.strokeStyle = 'rgba(192,132,252,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([4, 8]);
      ctx.beginPath(); ctx.arc(this.player.x, this.player.y, 340 * 0.28, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }

    this.drawPlayer(ctx, this.player.x, this.player.y, this.player.ang, '#38bdf8', '#0c4a6e', this.player.step, 0, false, true);
    this.drawBall(ctx);
    for (const q of this.particles) {
      ctx.globalAlpha = Math.max(0, q.life); ctx.fillStyle = q.color;
      ctx.beginPath(); ctx.arc(q.x, q.y, q.size * q.life, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      ctx.globalAlpha = Math.min(1, t.life * 1.5); ctx.font = `900 ${t.size}px system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(t.text, t.x, t.y); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    if (this.banner.life > 0) {
      const l = this.banner.life; const a = Math.min(1, l * 3); const s = 1 + Math.max(0, l - 1.3) * 4;
      ctx.save(); ctx.translate(W / 2, H / 2 - 40); ctx.scale(s, s); ctx.globalAlpha = a;
      ctx.font = '900 50px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(this.banner.text, 0, 0); ctx.fillStyle = this.banner.color; ctx.fillText(this.banner.text, 0, 0);
      if (this.banner.sub) {
        ctx.font = '800 18px system-ui, sans-serif'; ctx.lineWidth = 5;
        ctx.strokeText(this.banner.sub, 0, 30); ctx.fillStyle = '#fff'; ctx.fillText(this.banner.sub, 0, 30);
      }
      ctx.restore();
    }
    ctx.restore();
    if (this.flash > 0) { ctx.fillStyle = `rgba(${this.flashColor},${this.flash * 0.45})`; ctx.fillRect(0, 0, W, H); }
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (this.time < 10 && this.phase === 'playing') {
      ctx.fillStyle = `rgba(239,68,68,${0.08 + Math.sin(this.tick * 8) * 0.06})`; ctx.fillRect(0, 0, W, H);
    }
  }

  private drawPickup(ctx: CanvasRenderingContext2D, q: Pickup) {
    const pulse = 1 + Math.sin(q.t * 5) * 0.12;
    const colors: Record<Pickup['type'], [string, string, string]> = {
      time: ['#a7f3d0', '#059669', '+'], x2: ['#f9a8d4', '#be185d', '2x'],
      speed: ['#7dd3fc', '#0369a1', '>>'], magnet: ['#d8b4fe', '#7e22ce', 'U'],
    };
    const [c1, c2, glyph] = colors[q.type];
    const blink = q.life < 3 ? (Math.sin(q.t * 16) > 0 ? 1 : 0.35) : 1;
    ctx.save(); ctx.translate(q.x, q.y); ctx.globalAlpha = blink;
    ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(0, 0, 22 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(0, 0, 16 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a'; ctx.font = '900 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 0, 1);
    ctx.restore();
  }

  private drawPitch(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#2f9e44'; ctx.fillRect(-30, -30, W + 60, H + 60);
    for (let i = 0; i < 9; i++) { ctx.fillStyle = i % 2 ? '#2b8f3e' : '#33a64a'; ctx.fillRect(-30, i * 80 + 20, W + 60, 80); }
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
    ctx.strokeRect(14, GOAL_Y + GOAL_D, W - 28, H - GOAL_Y - GOAL_D + 40);
    ctx.strokeRect(W / 2 - 170, GOAL_Y + GOAL_D, 340, 150);
    ctx.strokeRect(W / 2 - 105, GOAL_Y + GOAL_D, 210, 60);
    ctx.beginPath(); ctx.arc(W / 2, GOAL_Y + GOAL_D + 105, 4, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(W / 2, GOAL_Y + GOAL_D + 105, 80, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H + 40, 90, Math.PI, 2 * Math.PI); ctx.stroke();
    const gx = W / 2 - GOAL_W / 2;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(gx, GOAL_Y, GOAL_W, GOAL_D);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
    for (let x = gx; x <= gx + GOAL_W; x += 10) { ctx.beginPath(); ctx.moveTo(x, GOAL_Y); ctx.lineTo(x, GOAL_Y + GOAL_D); ctx.stroke(); }
    for (let y = GOAL_Y; y <= GOAL_Y + GOAL_D; y += 9) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx + GOAL_W, y); ctx.stroke(); }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(gx, GOAL_Y + GOAL_D + 2); ctx.lineTo(gx, GOAL_Y); ctx.lineTo(gx + GOAL_W, GOAL_Y); ctx.lineTo(gx + GOAL_W, GOAL_Y + GOAL_D + 2); ctx.stroke();
    ctx.fillStyle = '#1e293b'; ctx.fillRect(-30, -30, W + 60, GOAL_Y - 6);
    for (let x = 0; x < W; x += 12) for (let y = 4; y < GOAL_Y - 12; y += 12) {
      const h = ((x * 7 + y * 13) % 360); const bob = Math.sin(this.tick * 6 + x * 0.3) * (this.banner.life > 0 ? 3 : 1);
      ctx.fillStyle = `hsl(${h},60%,${45 + ((x + y) % 3) * 8}%)`; ctx.beginPath(); ctx.arc(x + 6, y + 6 + bob, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, shirt: string, dark: string, step: number, dive = 0, stunned = false, isHero = false) {
    ctx.save(); ctx.translate(x, y);
    if (dive) { ctx.rotate(dive * 0.9); ctx.scale(1 + Math.abs(dive) * 0.6, 1 - Math.abs(dive) * 0.2); }
    if (stunned) ctx.globalAlpha = 0.6;
    const sw = Math.sin(step) * 6;
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(Math.cos(ang) * sw + Math.cos(ang + Math.PI / 2) * 7, Math.sin(ang) * sw + Math.sin(ang + Math.PI / 2) * 7, 5, 3.5, ang, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-Math.cos(ang) * sw + Math.cos(ang - Math.PI / 2) * 7, -Math.sin(ang) * sw + Math.sin(ang - Math.PI / 2) * 7, 5, 3.5, ang, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(Math.cos(ang + Math.PI / 2) * 10, Math.sin(ang + Math.PI / 2) * 10); ctx.lineTo(Math.cos(ang - Math.PI / 2) * 10, Math.sin(ang - Math.PI / 2) * 10); ctx.stroke();
    ctx.fillStyle = '#fcd7b6'; ctx.beginPath(); ctx.arc(Math.cos(ang) * 3, Math.sin(ang) * 3, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = isHero ? '#fbbf24' : '#3f2a1d'; ctx.beginPath(); ctx.arc(Math.cos(ang) * 1, Math.sin(ang) * 1, 6.5, ang + Math.PI * 0.6, ang + Math.PI * 1.4); ctx.fill();
    if (isHero) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }

  private drawBall(ctx: CanvasRenderingContext2D) {
    const b = this.ball; const sp = len(b.vx, b.vy);
    if (sp > 300 && b.owner === 'none') {
      const grad = ctx.createLinearGradient(b.x, b.y, b.x - b.vx * 0.07, b.y - b.vy * 0.07);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = grad; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.07, b.y - b.vy * 0.07); ctx.stroke();
    }
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.spin);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1f2937';
    for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; ctx.beginPath(); ctx.arc(Math.cos(a) * 4.5, Math.sin(a) * 4.5, 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}
