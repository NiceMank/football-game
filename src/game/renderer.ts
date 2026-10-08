import { Ball } from './ball';
import type { Camera } from './camera';
import {
  BALL_R, BOX_DEPTH, BOX_HALF, CENTER_R, CORNER_R, CX, CY, GOAL_DEPTH, GOAL_H, GOAL_HALF,
  PEN_SPOT, PITCH_L, PITCH_W, PLAYER_H, SMALL_BOX_DEPTH, SMALL_BOX_HALF, TILT,
} from './constants';
import type { Match } from './match';
import { clamp } from './math';
import type { Player } from './player';
import type { Kit } from './team';

/* ------------------------------------------------------------------ */
/* Cached procedural textures (no external assets).                     */
/* ------------------------------------------------------------------ */

let grassPattern: CanvasPattern | null = null;
let crowdPattern: CanvasPattern | null = null;
let texturesTried = false;

function makeCanvas(w: number, h: number) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ensureTextures(ctx: CanvasRenderingContext2D) {
  if (texturesTried) return;
  texturesTried = true;
  const g = makeCanvas(96, 96);
  const gctx = g?.getContext('2d');
  if (g && gctx) {
    for (let i = 0; i < 900; i++) {
      const light = Math.random() < 0.5;
      gctx.fillStyle = light ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
      gctx.fillRect(Math.random() * 96, Math.random() * 96, 1 + Math.random() * 1.5, 1 + Math.random() * 2.5);
    }
    grassPattern = ctx.createPattern(g, 'repeat');
  }
  const c = makeCanvas(240, 120);
  const cctx = c?.getContext('2d');
  if (c && cctx) {
    const grd = cctx.createLinearGradient(0, 0, 0, 120);
    grd.addColorStop(0, '#0b1220');
    grd.addColorStop(1, '#172036');
    cctx.fillStyle = grd;
    cctx.fillRect(0, 0, 240, 120);
    const colors = ['#1d5fe0', '#d61f2c', '#f8fafc', '#fbbf24', '#64748b', '#94a3b8', '#334155', '#1e293b'];
    for (let row = 0; row < 10; row++) {
      for (let i = 0; i < 34; i++) {
        const x = i * 7 + (row % 2) * 3.5 + Math.random() * 2;
        const y = row * 12 + 6 + Math.random() * 2;
        cctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        cctx.globalAlpha = 0.55 + Math.random() * 0.4;
        cctx.beginPath();
        cctx.arc(x, y, 2.2, 0, Math.PI * 2);
        cctx.fill();
        cctx.fillRect(x - 2.6, y + 2, 5.2, 5);
      }
    }
    cctx.globalAlpha = 1;
    crowdPattern = ctx.createPattern(c, 'repeat');
  }
}

/* ------------------------------------------------------------------ */
/* Draw list (preallocated; sorted by depth every frame).               */
/* ------------------------------------------------------------------ */

interface Drawable {
  y: number;
  kind: 0 | 1 | 2;
  p: Player | null;
  goal: number;
}

const drawList: Drawable[] = [];
for (let i = 0; i < 16; i++) drawList.push({ y: 0, kind: 0, p: null, goal: 0 });

/* ------------------------------------------------------------------ */
/* Entry point                                                          */
/* ------------------------------------------------------------------ */

export function render(ctx: CanvasRenderingContext2D, m: Match, dpr: number) {
  ensureTextures(ctx);
  const cam = m.camera;
  const vw = cam.viewW;
  const vh = cam.viewH;
  const z = cam.zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, 0, vw, vh);

  drawStands(ctx, m, cam);

  // Ground plane in world units.
  ctx.setTransform(dpr * z, 0, 0, dpr * z * TILT, dpr * (vw / 2 - cam.x * z + cam.offsetX), dpr * (vh / 2 - cam.y * z * TILT + cam.offsetY));
  drawPitch(ctx);
  drawGroundEffects(ctx, m);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoards(ctx, m, cam);
  drawShadows(ctx, m, cam);
  drawMarkers(ctx, m, cam);
  drawGoalBack(ctx, cam, 0, -1);
  drawGoalBack(ctx, cam, PITCH_L, 1);

  // Depth-sorted players, ball and near posts.
  let n = 0;
  for (const p of m.all) {
    const d = drawList[n++];
    d.kind = 0;
    d.p = p;
    d.y = p.y;
  }
  const bd = drawList[n++];
  bd.kind = 1;
  bd.p = null;
  bd.y = m.ball.owner ? m.ball.owner.y + (m.ball.held ? 0.5 : Math.sin(m.ball.owner.facing) * 6) : m.ball.y;
  for (let g = 0; g < 2; g++) {
    const d = drawList[n++];
    d.kind = 2;
    d.p = null;
    d.goal = g;
    d.y = CY + GOAL_HALF;
  }
  for (let i = 1; i < n; i++) {
    const cur = drawList[i];
    let j = i - 1;
    while (j >= 0 && drawList[j].y > cur.y) {
      drawList[j + 1] = drawList[j];
      j--;
    }
    drawList[j + 1] = cur;
  }
  for (let i = 0; i < n; i++) {
    const d = drawList[i];
    if (d.kind === 0) drawPlayer(ctx, m, cam, d.p!);
    else if (d.kind === 1) drawBall(ctx, m, cam);
    else drawGoalFront(ctx, cam, d.goal === 0 ? 0 : PITCH_L, d.goal === 0 ? -1 : 1);
  }

  drawParticles(ctx, m, cam);
  drawOverheads(ctx, m, cam);
  drawVignette(ctx, vw, vh);
  drawFlash(ctx, m, vw, vh);
  drawBanner(ctx, m, vw, vh);
  drawMinimap(ctx, m, vw, vh);
}

/* ------------------------------------------------------------------ */
/* Stadium                                                              */
/* ------------------------------------------------------------------ */

function drawStands(ctx: CanvasRenderingContext2D, m: Match, cam: Camera) {
  const vw = cam.viewW;
  const vh = cam.viewH;
  const top = cam.sy(-66, 26);
  const bounce = Math.sin(m.time * 14) * 2.2 * clamp(m.excitement - 0.5, 0, 1);
  if (top > 0) {
    ctx.save();
    if (crowdPattern) {
      const ox = -cam.x * cam.zoom * 0.85;
      ctx.translate(ox, bounce);
      ctx.fillStyle = crowdPattern;
      ctx.fillRect(-ox, -bounce - 10, vw, top + 12);
    } else {
      ctx.fillStyle = '#172036';
      ctx.fillRect(0, 0, vw, top);
    }
    ctx.restore();
    // Stand roof shadow and floodlight glow.
    const grd = ctx.createLinearGradient(0, 0, 0, top);
    grd.addColorStop(0, 'rgba(2,6,23,0.85)');
    grd.addColorStop(1, 'rgba(2,6,23,0.05)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, vw, top);
  }
  const bottom = cam.sy(PITCH_W + 70, 0);
  if (bottom < vh) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, bottom, vw, vh - bottom);
    if (crowdPattern) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      const ox = -cam.x * cam.zoom * 1.1;
      ctx.translate(ox, bounce);
      ctx.fillStyle = crowdPattern;
      ctx.fillRect(-ox, bottom + 4 - bounce, vw, vh - bottom);
      ctx.restore();
    }
  }
}

function drawPitch(ctx: CanvasRenderingContext2D) {
  // Runoff and surrounding track.
  ctx.fillStyle = '#2b5e27';
  ctx.fillRect(-170, -70, PITCH_L + 340, PITCH_W + 145);
  // Mowing stripes across the whole grass area.
  const bands = 16;
  const bw = PITCH_L / bands;
  for (let i = -2; i < bands + 2; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#3e8f39' : '#47a142';
    ctx.fillRect(i * bw, -55, bw + 0.5, PITCH_W + 110);
  }
  // Subtle cross-mowing for a premium checkered look.
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let j = 0; j < 6; j++) {
    if (j % 2 === 0) ctx.fillRect(-2 * bw, j * (PITCH_W / 6), PITCH_L + 4 * bw, PITCH_W / 6);
  }
  if (grassPattern) {
    ctx.fillStyle = grassPattern;
    ctx.fillRect(-170, -70, PITCH_L + 340, PITCH_W + 145);
  }
  // Worn goalmouths.
  for (let g = 0; g < 2; g++) {
    const gx = g === 0 ? 0 : PITCH_L;
    const s = g === 0 ? 1 : -1;
    ctx.fillStyle = 'rgba(120,90,40,0.12)';
    ctx.beginPath();
    ctx.ellipse(gx + s * 40, CY, 70, 60, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.88)';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 3.2;
  ctx.lineJoin = 'miter';
  ctx.strokeRect(0, 0, PITCH_L, PITCH_W);
  ctx.beginPath();
  ctx.moveTo(CX, 0);
  ctx.lineTo(CX, PITCH_W);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(CX, CY, CENTER_R, 0, Math.PI * 2);
  ctx.stroke();
  dot(ctx, CX, CY, 4.5);

  for (let g = 0; g < 2; g++) {
    const gx = g === 0 ? 0 : PITCH_L;
    const s = g === 0 ? 1 : -1;
    ctx.strokeRect(g === 0 ? 0 : PITCH_L - BOX_DEPTH, CY - BOX_HALF, BOX_DEPTH, BOX_HALF * 2);
    ctx.strokeRect(g === 0 ? 0 : PITCH_L - SMALL_BOX_DEPTH, CY - SMALL_BOX_HALF, SMALL_BOX_DEPTH, SMALL_BOX_HALF * 2);
    const spot = gx + s * PEN_SPOT;
    dot(ctx, spot, CY, 3.8);
    const r = 95;
    const a = Math.acos((BOX_DEPTH - PEN_SPOT) / r);
    ctx.beginPath();
    if (g === 0) ctx.arc(spot, CY, r, -a, a);
    else ctx.arc(spot, CY, r, Math.PI - a, Math.PI + a);
    ctx.stroke();
    // Goal line inside the posts is slightly brighter.
    ctx.beginPath();
    ctx.moveTo(gx, CY - GOAL_HALF);
    ctx.lineTo(gx, CY + GOAL_HALF);
    ctx.stroke();
  }
  // Corner arcs.
  ctx.beginPath();
  ctx.arc(0, 0, CORNER_R, 0, Math.PI / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(PITCH_L, 0, CORNER_R, Math.PI / 2, Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, PITCH_W, CORNER_R, -Math.PI / 2, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(PITCH_L, PITCH_W, CORNER_R, Math.PI, Math.PI * 1.5);
  ctx.stroke();
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawBoards(ctx: CanvasRenderingContext2D, m: Match, cam: Camera) {
  const z = cam.zoom;
  const t = m.time;
  for (let side = 0; side < 2; side++) {
    const y = side === 0 ? -64 : PITCH_W + 64;
    const h = side === 0 ? 24 : 16;
    const x0 = cam.sx(-150);
    const x1 = cam.sx(PITCH_L + 150);
    const yb = cam.sy(y, 0);
    const yt = cam.sy(y, h);
    if (yt > cam.viewH || yb < 0) continue;
    ctx.fillStyle = '#0a0f1e';
    ctx.fillRect(x0, yt, x1 - x0, yb - yt);
    const seg = 150;
    const scroll = (t * 40) % seg;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, yt, x1 - x0, yb - yt);
    ctx.clip();
    for (let wx = -150 - seg + scroll; wx < PITCH_L + 150; wx += seg) {
      const k = Math.floor((wx + 1000) / seg) % 3;
      const sx = cam.sx(wx);
      const sw = seg * z;
      ctx.fillStyle = k === 0 ? '#1d4ed8' : k === 1 ? '#0f172a' : '#b91c1c';
      ctx.fillRect(sx + 1, yt + 1, sw - 2, yb - yt - 2);
      ctx.fillStyle = k === 1 ? '#fbbf24' : '#f8fafc';
      ctx.font = `italic 900 ${Math.max(6, (h - 8) * z)}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(k === 1 ? 'eFOOTBALL STRIKER' : k === 0 ? 'STRIKER FC' : 'PHÉNIX ROUGE', sx + 8 * z, (yt + yb) / 2);
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x0, yt, x1 - x0, 1.5);
  }
}

/* ------------------------------------------------------------------ */
/* Goals                                                                */
/* ------------------------------------------------------------------ */

function inView(cam: Camera, x: number) {
  const sx = cam.sx(x);
  return sx > -200 && sx < cam.viewW + 200;
}

function drawGoalBack(ctx: CanvasRenderingContext2D, cam: Camera, gx: number, s: number) {
  if (!inView(cam, gx)) return;
  const y1 = CY - GOAL_HALF;
  const y2 = CY + GOAL_HALF;
  const bx = gx + s * GOAL_DEPTH;
  const H = GOAL_H;
  const HB = GOAL_H * 0.72;
  // Ground inside the goal.
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  poly(ctx, cam, gx, y1, 0, gx, y2, 0, bx, y2, 0, bx, y1, 0);
  ctx.fill();
  // Back net, far side net and roof.
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  poly(ctx, cam, bx, y1, 0, bx, y1, HB, bx, y2, HB, bx, y2, 0);
  ctx.fill();
  poly(ctx, cam, gx, y1, 0, gx, y1, H, bx, y1, HB, bx, y1, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  poly(ctx, cam, gx, y1, H, gx, y2, H, bx, y2, HB, bx, y1, HB);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.32)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let y = y1; y <= y2 + 0.1; y += 12) {
    ctx.moveTo(cam.sx(bx), cam.sy(y, 0));
    ctx.lineTo(cam.sx(bx), cam.sy(y, HB));
    ctx.moveTo(cam.sx(gx), cam.sy(y, H));
    ctx.lineTo(cam.sx(bx), cam.sy(y, HB));
  }
  for (let h = 0; h <= HB + 0.1; h += 9) {
    ctx.moveTo(cam.sx(bx), cam.sy(y1, h));
    ctx.lineTo(cam.sx(bx), cam.sy(y2, h));
  }
  for (let d = 0; d <= GOAL_DEPTH + 0.1; d += 11) {
    const x = gx + s * d;
    const top = H - (H - HB) * (d / GOAL_DEPTH);
    ctx.moveTo(cam.sx(x), cam.sy(y1, 0));
    ctx.lineTo(cam.sx(x), cam.sy(y1, top));
  }
  ctx.stroke();
  // Far post + crossbar.
  ctx.strokeStyle = '#f8fafc';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, 4.5 * cam.zoom);
  ctx.beginPath();
  ctx.moveTo(cam.sx(gx), cam.sy(y1, 0));
  ctx.lineTo(cam.sx(gx), cam.sy(y1, H));
  ctx.lineTo(cam.sx(gx), cam.sy(y2, H));
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawGoalFront(ctx: CanvasRenderingContext2D, cam: Camera, gx: number, s: number) {
  if (!inView(cam, gx)) return;
  const y2 = CY + GOAL_HALF;
  const bx = gx + s * GOAL_DEPTH;
  const H = GOAL_H;
  const HB = GOAL_H * 0.72;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  poly(ctx, cam, gx, y2, 0, gx, y2, H, bx, y2, HB, bx, y2, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let d = 0; d <= GOAL_DEPTH + 0.1; d += 11) {
    const x = gx + s * d;
    const top = H - (H - HB) * (d / GOAL_DEPTH);
    ctx.moveTo(cam.sx(x), cam.sy(y2, 0));
    ctx.lineTo(cam.sx(x), cam.sy(y2, top));
  }
  for (let h = 0; h <= H; h += 9) {
    ctx.moveTo(cam.sx(gx), cam.sy(y2, h));
    ctx.lineTo(cam.sx(bx), cam.sy(y2, Math.min(h, HB)));
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = Math.max(2, 4.5 * cam.zoom);
  ctx.beginPath();
  ctx.moveTo(cam.sx(gx) + 2, cam.sy(y2, 0) + 1);
  ctx.lineTo(cam.sx(gx) + 2 + H * cam.zoom * 0.35, cam.sy(y2, 0) + 3);
  ctx.stroke();
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cam.sx(gx), cam.sy(y2, 0));
  ctx.lineTo(cam.sx(gx), cam.sy(y2, H));
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function poly(ctx: CanvasRenderingContext2D, cam: Camera, ...pts: number[]) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i += 3) {
    const x = cam.sx(pts[i]);
    const y = cam.sy(pts[i + 1], pts[i + 2]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/* ------------------------------------------------------------------ */
/* Ground layer: shadows, markers                                       */
/* ------------------------------------------------------------------ */

function drawGroundEffects(ctx: CanvasRenderingContext2D, m: Match) {
  for (const p of m.effects.particles) {
    if (!p.active || p.kind !== 'ring') continue;
    const k = 1 - p.life / p.max;
    ctx.strokeStyle = `rgba(255,255,255,${(1 - k) * 0.5})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size + k * 26, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawShadows(ctx: CanvasRenderingContext2D, m: Match, cam: Camera) {
  const z = cam.zoom;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  for (const p of m.all) {
    ctx.beginPath();
    ctx.ellipse(cam.sx(p.x) + 3 * z, cam.sy(p.y) + 1 * z, 11 * z, 4.6 * z, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const b = m.ball;
  const h = clamp(b.z / 120, 0, 0.6);
  ctx.fillStyle = `rgba(0,0,0,${0.35 - h * 0.35})`;
  ctx.beginPath();
  ctx.ellipse(cam.sx(b.x) + b.z * 0.15 * z, cam.sy(b.y) + 0.5 * z, (BALL_R + 1) * z * (1 - h * 0.5), (BALL_R * 0.55) * z * (1 - h * 0.5), 0, 0, Math.PI * 2);
  ctx.fill();
}

function ring(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, r: number, color: string, width: number, dash = 0, rot = 0) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash > 0) ctx.setLineDash([dash, dash * 0.8]);
  ctx.lineDashOffset = rot;
  ctx.beginPath();
  ctx.ellipse(cam.sx(x), cam.sy(y), r * cam.zoom, r * cam.zoom * TILT, 0, 0, Math.PI * 2);
  ctx.stroke();
  if (dash > 0) ctx.setLineDash([]);
}

function drawMarkers(ctx: CanvasRenderingContext2D, m: Match, cam: Camera) {
  const b = m.ball;
  const team = m.humanTeam;
  const t = m.time;
  if (team && team.controlled) {
    const p = team.controlled;
    const z = cam.zoom;
    // Ground marker: a short ring and a facing notch, readable on both mowing stripes.
    ctx.fillStyle = 'rgba(253,224,71,0.16)';
    ctx.beginPath();
    ctx.ellipse(cam.sx(p.x), cam.sy(p.y), 15 * z, 15 * z * TILT, 0, 0, Math.PI * 2);
    ctx.fill();
    ring(ctx, cam, p.x, p.y, 15, '#fde047', 2.4);
    if (p.stamina < 0.6) {
      ctx.strokeStyle = p.stamina > 0.3 ? 'rgba(250,204,21,0.8)' : 'rgba(248,113,113,0.9)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(cam.sx(p.x), cam.sy(p.y), 18 * z, 18 * z * TILT, 0, Math.PI * 0.6, Math.PI * 0.6 + Math.PI * 1.8 * p.stamina);
      ctx.stroke();
    }
    const fx = Math.cos(p.facing);
    const fy = Math.sin(p.facing);
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    const tipX = cam.sx(p.x + fx * 21);
    const tipY = cam.sy(p.y + fy * 21);
    const lx = cam.sx(p.x + fx * 16 - fy * 4);
    const ly = cam.sy(p.y + fy * 16 + fx * 4);
    const rx = cam.sx(p.x + fx * 16 + fy * 4);
    const ry = cam.sy(p.y + fy * 16 - fx * 4);
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(lx, ly);
    ctx.lineTo(rx, ry);
    ctx.closePath();
    ctx.fill();
    // Pass preview / receiver.
    const showPass = b.owner === p || m.state === 'taking';
    const preview = m.human.previewTarget;
    if (preview && showPass) ring(ctx, cam, preview.x, preview.y, 15, 'rgba(255,255,255,0.9)', 2, 5, -t * 30);
    else if (m.human.previewPoint && showPass) {
      const s = m.human.previewPoint;
      ring(ctx, cam, s.x, s.y, 8, 'rgba(255,255,255,0.7)', 1.6, 3, -t * 24);
    }
  }
  if (b.free && b.passTarget && m.state === 'live') {
    const r = b.passTarget;
    ring(ctx, cam, b.passTargetX, b.passTargetY, 10 + Math.sin(t * 10) * 2, r.team.side === 'home' ? 'rgba(96,165,250,0.8)' : 'rgba(248,113,113,0.6)', 2, 4, t * 20);
  }
  if (b.owner && (!team || b.owner.team !== team)) {
    ring(ctx, cam, b.owner.x, b.owner.y, 14, 'rgba(248,113,113,0.55)', 1.5);
  }
  // Restart aim arrow for the human taker.
  if (team && m.state === 'taking' && m.restart && m.restart.team === team && m.restart.type !== 'goalkick') {
    const p = m.restart.taker;
    const ax = m.human.aimX;
    const ay = m.human.aimY;
    ctx.strokeStyle = 'rgba(253,224,71,0.9)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -t * 30;
    ctx.beginPath();
    ctx.moveTo(cam.sx(p.x), cam.sy(p.y));
    ctx.lineTo(cam.sx(p.x + ax * 90), cam.sy(p.y + ay * 90));
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/* ------------------------------------------------------------------ */
/* Players                                                              */
/* ------------------------------------------------------------------ */

function limb(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, w: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawPlayer(ctx: CanvasRenderingContext2D, m: Match, cam: Camera, p: Player) {
  const sx = cam.sx(p.x);
  const sy = cam.sy(p.y);
  if (sx < -60 || sx > cam.viewW + 60 || sy < -80 || sy > cam.viewH + 60) return;
  const kit: Kit = p.team.kit;
  const isGK = p.isGK;
  const shirt = isGK ? kit.keeper : kit.primary;
  const trim = isGK ? kit.keeperTrim : kit.secondary;
  const skin = kit.skin[p.index % kit.skin.length];
  const hair = kit.hair[p.index % kit.hair.length];
  const k = cam.zoom;

  const run = clamp(p.speed / 250, 0, 1);
  const ph = p.anim;
  const fx = Math.cos(p.facing);
  const fy = Math.sin(p.facing) * TILT;
  const stride = Math.sin(ph) * 5.5 * run;
  const bob = Math.abs(Math.sin(ph)) * 1.5 * run;
  const back = Math.sin(p.facing) < -0.4;
  const sideView = Math.abs(fx) > 0.55;

  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(k, k);

  let lying = 0;
  let lift = 0;
  const gk = p.gk;
  if (gk && (gk.state === 'dive' || gk.state === 'down')) {
    const prog = gk.state === 'dive' ? 1 - gk.timer / 0.48 : 1;
    lift = gk.state === 'dive' ? Math.sin(Math.min(1, prog * 1.4) * Math.PI) * (gk.diveHigh ? 22 : 9) : 0;
    lying = gk.diveSide * (p.team.dir > 0 ? 1 : -1) * (gk.state === 'down' ? 1.45 : 1.2 * Math.min(1, prog * 2.2));
  } else if (p.slide > 0) {
    lying = (fx >= 0 ? -1 : 1) * 1.15;
  } else if (p.stun > 0.3 && m.state === 'live') {
    lying = (p.index % 2 ? 1 : -1) * 0.5;
  }
  if (lying !== 0) {
    ctx.translate(0, -lift);
    ctx.rotate(lying);
  }

  ctx.lineCap = 'round';
  const legSpread = sideView ? 1.6 : 3.4;
  const px = -fy;
  const py = fx;
  const pn = Math.hypot(px, py) || 1;
  const lx = (px / pn) * legSpread;
  const ly = (py / pn) * legSpread * 0.4;
  let kick = 0;
  if (p.kickAnim > 0) kick = Math.sin((1 - p.kickAnim / 0.3) * Math.PI) * 9;
  const footLX = lx + stride * fx + kick * fx;
  const footLY = ly + stride * fy - Math.max(0, kick) * 0.4;
  const footRX = -lx - stride * fx;
  const footRY = -ly - stride * fy;
  const hipY = -13 - bob;
  // Legs: skin thigh, sock, boot.
  limb(ctx, lx * 0.8, hipY, (lx * 0.8 + footLX) / 2, (hipY + footLY) / 2, 3.6, skin);
  limb(ctx, (lx * 0.8 + footLX) / 2, (hipY + footLY) / 2, footLX, footLY - 1.5, 3.8, isGK ? '#111827' : kit.socks);
  limb(ctx, -lx * 0.8, hipY, (-lx * 0.8 + footRX) / 2, (hipY + footRY) / 2, 3.6, skin);
  limb(ctx, (-lx * 0.8 + footRX) / 2, (hipY + footRY) / 2, footRX, footRY - 1.5, 3.8, isGK ? '#111827' : kit.socks);
  ctx.fillStyle = '#0b0b0b';
  ctx.beginPath();
  ctx.arc(footLX + fx * 1.2, footLY - 0.6, 2.1, 0, Math.PI * 2);
  ctx.arc(footRX + fx * 1.2, footRY - 0.6, 2.1, 0, Math.PI * 2);
  ctx.fill();

  // Shorts.
  const bw = sideView ? 11 : 14;
  ctx.fillStyle = isGK ? '#111827' : kit.shorts;
  roundRect(ctx, -bw / 2, hipY - 5, bw, 7, 2);
  ctx.fill();

  // Arms swing opposite to legs (raised when celebrating).
  const shoulderY = hipY - 15;
  const armSwing = -stride * 0.8;
  const celebrating = p.celebrate > 0;
  const armColor = skin;
  const handsUp = celebrating || (gk !== null && (gk.state === 'dive' || gk.state === 'react'));
  const ax = bw / 2 + 0.5;
  if (handsUp) {
    limb(ctx, -ax, shoulderY + 1, -ax - 4, shoulderY - 10, 3.2, isGK ? shirt : armColor);
    limb(ctx, ax, shoulderY + 1, ax + 4, shoulderY - 10, 3.2, isGK ? shirt : armColor);
    if (isGK) {
      ctx.fillStyle = trim;
      ctx.beginPath();
      ctx.arc(-ax - 4, shoulderY - 11, 2.4, 0, Math.PI * 2);
      ctx.arc(ax + 4, shoulderY - 11, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    limb(ctx, -ax, shoulderY + 1, -ax - 1 + armSwing * fx * 0.6, shoulderY + 10 + armSwing * fy, 3, armColor);
    limb(ctx, ax, shoulderY + 1, ax + 1 - armSwing * fx * 0.6, shoulderY + 10 - armSwing * fy, 3, armColor);
    limb(ctx, -ax, shoulderY + 1, -ax - 0.5, shoulderY + 4, 3.4, shirt);
    limb(ctx, ax, shoulderY + 1, ax + 0.5, shoulderY + 4, 3.4, shirt);
    if (isGK) {
      ctx.fillStyle = trim;
      ctx.beginPath();
      ctx.arc(-ax - 1 + armSwing * fx * 0.6, shoulderY + 10.5 + armSwing * fy, 2.2, 0, Math.PI * 2);
      ctx.arc(ax + 1 - armSwing * fx * 0.6, shoulderY + 10.5 - armSwing * fy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Torso / jersey.
  ctx.fillStyle = shirt;
  roundRect(ctx, -bw / 2, shoulderY, bw, 16, 3.5);
  ctx.fill();
  ctx.fillStyle = trim;
  if (!isGK) {
    // Signature sash / stripe in the secondary colour.
    ctx.fillRect(-bw / 2 + bw * 0.38, shoulderY + 1, bw * 0.24, 14);
  } else {
    ctx.fillRect(-bw / 2, shoulderY + 6, bw, 2.2);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(-bw / 2, shoulderY + 11, bw, 5);
  if (back) {
    ctx.fillStyle = isGK ? '#0f172a' : p.team.side === 'home' ? '#0f172a' : '#fde68a';
    ctx.font = '900 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(p.number), 0, shoulderY + 8);
  }

  // Head.
  const headY = shoulderY - 6;
  const hx = sideView ? fx * 1.2 : 0;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(hx, headY, 5.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  if (back) {
    ctx.arc(hx, headY, 5.4, Math.PI * 0.95, Math.PI * 2.05);
    ctx.lineTo(hx + 5.4, headY + 2);
    ctx.lineTo(hx - 5.4, headY + 2);
  } else if (sideView) {
    ctx.arc(hx - fx * 0.8, headY - 0.6, 5.3, fx > 0 ? Math.PI * 0.75 : Math.PI * 1.05, fx > 0 ? Math.PI * 1.95 : Math.PI * 2.25);
  } else {
    ctx.arc(hx, headY - 0.8, 5.3, Math.PI * 1.02, Math.PI * 1.98);
  }
  ctx.fill();
  if (!back) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    if (sideView) {
      ctx.fillRect(hx + fx * 2.6 - 0.6, headY - 0.5, 1.2, 1.2);
    } else {
      ctx.fillRect(hx - 2.2, headY - 0.5, 1.2, 1.2);
      ctx.fillRect(hx + 1, headY - 0.5, 1.2, 1.2);
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Ball                                                                 */
/* ------------------------------------------------------------------ */

function drawBall(ctx: CanvasRenderingContext2D, m: Match, cam: Camera) {
  const b = m.ball;
  const z = cam.zoom;
  const r = BALL_R * z * 1.08;
  // Trail for powerful strikes.
  if (b.trailCount > 1) {
    const n = b.trailCount;
    const L = Ball.TRAIL_LEN;
    ctx.lineCap = 'round';
    let prevX = cam.sx(b.x);
    let prevY = cam.sy(b.y, b.z + BALL_R);
    for (let i = 0; i < n; i++) {
      const idx = ((b.trailHead - 1 - i + L * 2) % L) * 3;
      const x = cam.sx(b.trail[idx]);
      const y = cam.sy(b.trail[idx + 1], b.trail[idx + 2] + BALL_R);
      const a = (1 - i / n) * 0.55;
      ctx.strokeStyle = b.shotPower > 0.78 ? `rgba(253,186,116,${a})` : `rgba(255,255,255,${a})`;
      ctx.lineWidth = r * 1.8 * (1 - i / n);
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();
      prevX = x;
      prevY = y;
    }
    ctx.lineCap = 'butt';
  }
  const x = cam.sx(b.x);
  const y = cam.sy(b.y, b.z + BALL_R);
  const grd = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.7, '#e5e7eb');
  grd.addColorStop(1, '#9ca3af');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // Rolling panels.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#1f2937';
  const dx = Math.cos(b.spinDir);
  const dy = Math.sin(b.spinDir) * TILT;
  for (let i = 0; i < 3; i++) {
    const u = ((b.spin * 0.16 + i / 3) % 1) * 2 - 1;
    const off = (i - 1) * 0.55;
    const px = x + dx * u * r - dy * off * r;
    const py = y + dy * u * r + dx * off * r * 0.6;
    ctx.beginPath();
    ctx.arc(px, py, r * 0.32 * (1 - Math.abs(u) * 0.45), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(15,23,42,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* Particles and overheads                                              */
/* ------------------------------------------------------------------ */

function drawParticles(ctx: CanvasRenderingContext2D, m: Match, cam: Camera) {
  const z = cam.zoom;
  for (const p of m.effects.particles) {
    if (!p.active || p.kind === 'ring') continue;
    const a = clamp(p.life / p.max, 0, 1);
    const x = cam.sx(p.x);
    const y = cam.sy(p.y, p.z);
    if (p.kind === 'net') {
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(x, y, (1 - a) * p.size * z + 4, (1 - a) * p.size * z * 1.2 + 4, 0, 0, Math.PI * 2);
      ctx.stroke();
      continue;
    }
    ctx.globalAlpha = p.kind === 'confetti' ? Math.min(1, a * 2) : a;
    ctx.fillStyle = p.color;
    if (p.kind === 'confetti') {
      const w = p.size * z;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(p.rot);
      ctx.fillRect(-w / 2, -w * 0.3, w, w * 0.6 * Math.abs(Math.cos(p.rot * 1.3)) + 0.5);
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, p.size * z * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

let tagPlayer: Player | null = null;
let tagSince = 0;

function drawOverheads(ctx: CanvasRenderingContext2D, m: Match, cam: Camera) {
  const team = m.humanTeam;
  const z = cam.zoom;
  if (!team || !team.controlled) return;
  const p = team.controlled;
  const sx = cam.sx(p.x);
  const sy = cam.sy(p.y, PLAYER_H + 9);
  const vw = cam.viewW;
  const vh = cam.viewH;
  if (sx < 0 || sx > vw || sy < 0 || sy > vh) {
    // Off-screen pointer toward the controlled player.
    const cx = clamp(sx, 26, vw - 26);
    const cy = clamp(sy, 70, vh - 26);
    const a = Math.atan2(sy - cy, sx - cx);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return;
  }
  // Small chevron; the name tag only appears briefly after the controlled player changes.
  if (tagPlayer !== p) {
    tagPlayer = p;
    tagSince = m.time;
  }
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.moveTo(sx, sy + 5);
  ctx.lineTo(sx - 4.5, sy);
  ctx.lineTo(sx + 4.5, sy);
  ctx.closePath();
  ctx.fill();
  const tagAge = m.time - tagSince;
  if (tagAge >= 0 && tagAge < 1.4) {
    ctx.globalAlpha = clamp((1.4 - tagAge) / 0.4, 0, 1);
    const label = `${p.number} ${p.name.toUpperCase()}`;
    ctx.font = '700 10px system-ui, sans-serif';
    const w = ctx.measureText(label).width + 8;
    ctx.fillStyle = 'rgba(2,6,23,0.6)';
    roundRect(ctx, sx - w / 2, sy - 16, w, 13, 4);
    ctx.fill();
    ctx.fillStyle = '#fef9c3';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, sx, sy - 9.5);
    ctx.globalAlpha = 1;
  }

  // Charge bar (shot or lofted pass).
  const h = m.human;
  if (h.chargeKind && (m.ball.owner === p || m.state === 'taking')) {
    const bw = 54;
    const bx = sx - bw / 2;
    const by = sy - 31;
    ctx.fillStyle = 'rgba(2,6,23,0.8)';
    roundRect(ctx, bx - 2, by - 2, bw + 4, 9, 4);
    ctx.fill();
    if (h.chargeKind === 'shot') {
      ctx.fillStyle = 'rgba(248,113,113,0.35)';
      ctx.fillRect(bx + bw * 0.82, by, bw * 0.18, 5);
    }
    const c = h.charge;
    ctx.fillStyle = h.chargeKind === 'pass' ? '#60a5fa' : c > 0.82 ? '#f87171' : c > 0.6 ? '#fb923c' : '#fde047';
    ctx.fillRect(bx, by, bw * c, 5);
    // Aim reticle on the goal mouth while charging a shot.
    if (h.chargeKind === 'shot' && m.ball.owner === p) {
      const aim = h.shotReticle(p);
      const rx = cam.sx(p.team.oppGoalX);
      const ry = cam.sy(aim.y, aim.z);
      if (rx > 0 && rx < vw) {
        ctx.strokeStyle = 'rgba(253,224,71,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(rx, ry, 7 + (1 - c) * 6, 0, Math.PI * 2);
        ctx.moveTo(rx - 11, ry);
        ctx.lineTo(rx + 11, ry);
        ctx.moveTo(rx, ry - 11);
        ctx.lineTo(rx, ry + 11);
        ctx.stroke();
      }
    }
  }
  void z;
}

/* ------------------------------------------------------------------ */
/* Screen overlays                                                      */
/* ------------------------------------------------------------------ */

let vignette: CanvasGradient | null = null;
let vignetteW = 0;
let vignetteH = 0;

function drawVignette(ctx: CanvasRenderingContext2D, vw: number, vh: number) {
  if (!vignette || vignetteW !== vw || vignetteH !== vh) {
    vignette = ctx.createRadialGradient(vw / 2, vh * 0.55, Math.min(vw, vh) * 0.45, vw / 2, vh * 0.55, Math.max(vw, vh) * 0.75);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.38)');
    vignetteW = vw;
    vignetteH = vh;
  }
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, vw, vh);
}

function drawFlash(ctx: CanvasRenderingContext2D, m: Match, vw: number, vh: number) {
  const f = m.effects.flash;
  if (f <= 0) return;
  ctx.globalAlpha = f * 0.35;
  ctx.fillStyle = m.effects.flashColor;
  ctx.fillRect(0, 0, vw, vh);
  ctx.globalAlpha = 1;
}

function drawBanner(ctx: CanvasRenderingContext2D, m: Match, vw: number, vh: number) {
  const b = m.effects.banner;
  if (!b) return;
  const tIn = clamp(b.time / 0.22, 0, 1);
  const tOut = clamp((b.duration - b.time) / 0.3, 0, 1);
  const a = Math.min(tIn, tOut);
  const big = b.text === 'BUT !' || b.text === 'FIN DU MATCH' || b.text === 'MI-TEMPS';
  const size = Math.round(clamp(vw * (big ? 0.075 : 0.042), big ? 40 : 22, big ? 96 : 46));
  const y = vh * (big ? 0.4 : 0.3);
  const slide = (1 - tIn) * -vw * 0.25;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(vw / 2 + slide, y);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  const bandH = size * (b.sub ? 1.85 : 1.35);
  const bandW = Math.min(vw * 0.9, size * (b.text.length * 0.62 + 4));
  const grd = ctx.createLinearGradient(-bandW / 2, 0, bandW / 2, 0);
  grd.addColorStop(0, 'rgba(2,6,23,0)');
  grd.addColorStop(0.15, 'rgba(2,6,23,0.82)');
  grd.addColorStop(0.85, 'rgba(2,6,23,0.82)');
  grd.addColorStop(1, 'rgba(2,6,23,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(-bandW / 2, -bandH / 2, bandW, bandH);
  ctx.fillStyle = b.color;
  ctx.fillRect(-bandW * 0.35, -bandH / 2, bandW * 0.7, 3);
  ctx.fillRect(-bandW * 0.35, bandH / 2 - 3, bandW * 0.7, 3);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 900 ${size}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(b.text, 3, (b.sub ? -size * 0.22 : 0) + 3);
  ctx.fillStyle = b.color;
  ctx.fillText(b.text, 0, b.sub ? -size * 0.22 : 0);
  if (b.sub) {
    ctx.font = `800 ${Math.round(size * 0.34)}px system-ui, sans-serif`;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(b.sub, 0, size * 0.52);
  }
  ctx.restore();
}

function drawMinimap(ctx: CanvasRenderingContext2D, m: Match, vw: number, vh: number) {
  const w = clamp(vw * 0.13, 110, 180);
  const h = (w * PITCH_W) / PITCH_L;
  const x0 = vw / 2 - w / 2;
  const y0 = vh - h - Math.max(10, vh * 0.02);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(2,6,23,0.55)';
  roundRect(ctx, x0 - 5, y0 - 5, w + 10, h + 10, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, w, h);
  ctx.beginPath();
  ctx.moveTo(x0 + w / 2, y0);
  ctx.lineTo(x0 + w / 2, y0 + h);
  ctx.stroke();
  const sx = w / PITCH_L;
  const sy = h / PITCH_W;
  const cam = m.camera;
  const vwW = cam.viewW / cam.zoom;
  const vwH = cam.viewH / (cam.zoom * TILT);
  ctx.strokeStyle = 'rgba(253,224,71,0.35)';
  ctx.strokeRect(x0 + clamp((cam.x - vwW / 2) * sx, 0, w), y0 + clamp((cam.y - vwH / 2) * sy, 0, h), Math.min(w, vwW * sx), Math.min(h, vwH * sy));
  for (const p of m.all) {
    ctx.fillStyle = p.isGK ? p.team.kit.keeper : p.team.kit.primary;
    ctx.beginPath();
    ctx.arc(x0 + clamp(p.x, 0, PITCH_L) * sx, y0 + clamp(p.y, 0, PITCH_W) * sy, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const team = m.humanTeam;
  if (team && team.controlled) {
    const p = team.controlled;
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x0 + clamp(p.x, 0, PITCH_L) * sx, y0 + clamp(p.y, 0, PITCH_W) * sy, 4.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x0 + clamp(m.ball.x, 0, PITCH_L) * sx, y0 + clamp(m.ball.y, 0, PITCH_W) * sy, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

