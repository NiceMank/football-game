import { GOAL_DEPTH, PITCH_L, PITCH_W, TILT } from './constants';
import { clamp, damp } from './math';

/** Broadcast-style camera: follows the ball with look-ahead, keeps goals in frame near the box. */
export class Camera {
  x = PITCH_L / 2;
  y = PITCH_W / 2;
  zoom = 1;
  viewW = 1280;
  viewH = 720;
  private fx = PITCH_L / 2;
  private fy = PITCH_W / 2;
  private zoomTarget = 1;
  offsetX = 0;
  offsetY = 0;

  /** Visible world area at base zoom; slightly widened on very wide screens. */
  resize(viewW: number, viewH: number) {
    this.viewW = viewW;
    this.viewH = viewH;
    this.zoomTarget = this.baseZoom();
    this.zoom = this.zoomTarget;
  }

  private baseZoom() {
    const wantW = 1220;
    const wantH = 720;
    return Math.min(this.viewW / wantW, this.viewH / (wantH * TILT));
  }

  snap(x: number, y: number) {
    this.fx = x;
    this.fy = y;
    this.x = x;
    this.y = y;
    this.clampToPitch();
  }

  update(dt: number, focusX: number, focusY: number, zoomOut: number, shake: number) {
    this.fx = damp(this.fx, focusX, 3.2, dt);
    this.fy = damp(this.fy, focusY, 2.6, dt);
    this.zoomTarget = this.baseZoom() * (1 - zoomOut * 0.1);
    this.zoom = damp(this.zoom, this.zoomTarget, 2, dt);
    this.x = this.fx;
    this.y = this.fy;
    this.clampToPitch();
    if (shake > 0) {
      this.offsetX = (Math.random() - 0.5) * shake * 2;
      this.offsetY = (Math.random() - 0.5) * shake * 2;
    } else {
      this.offsetX = 0;
      this.offsetY = 0;
    }
  }

  private clampToPitch() {
    const halfW = this.viewW / this.zoom / 2;
    const halfH = this.viewH / (this.zoom * TILT) / 2;
    const marginX = GOAL_DEPTH + 60;
    const minX = -marginX + halfW;
    const maxX = PITCH_L + marginX - halfW;
    this.x = minX > maxX ? PITCH_L / 2 : clamp(this.x, minX, maxX);
    const minY = -70 + halfH;
    const maxY = PITCH_W + 40 - halfH;
    this.y = minY > maxY ? PITCH_W / 2 - 15 : clamp(this.y, minY, maxY);
  }

  /** Screen x (CSS px) of world point. */
  sx(x: number) {
    return (x - this.x) * this.zoom + this.viewW / 2 + this.offsetX;
  }

  /** Screen y (CSS px) of world point with height z. */
  sy(y: number, z = 0) {
    return (y - this.y) * this.zoom * TILT + this.viewH / 2 - z * this.zoom + this.offsetY;
  }
}
