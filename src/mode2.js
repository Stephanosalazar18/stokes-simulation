// Mode 2: Gradientes 3D (PavelDoGreat simplificado)
// Full fluid simulation with theorem overlay.

import { FluidSim } from './FluidSim.js';
import { TheoremOverlay } from './theorem.js';

export class Mode2 {
  constructor(canvas, onTheoremUpdate) {
    this.canvas = canvas;
    this.fluidOverlayCanvas = null;
    this.overlayCtx = null;
    this.onTheoremUpdate = onTheoremUpdate;

    // Cursor state
    this.cursor = { x: 0.5, y: 0.5, prevX: 0.5, prevY: 0.5 };
    this.mouseDown = false;
    this.colorTimer = 0;
    this.color = { r: 0.1, g: 0.05, b: 0.3 };

    // Fluid sim
    this.fluid = new FluidSim(canvas);

    // Theorem overlay (draws on a transparent 2D canvas on top of WebGL)
    this._setupOverlay();

    // Theorem
    this.theorem = new TheoremOverlay();
    this.tRadius = 0.15;  // Default C radius

    // Bind events
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp   = this._handleMouseUp.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);
    this._onTouchMove  = this._handleTouchMove.bind(this);
    this._onTouchEnd   = this._handleTouchEnd.bind(this);

    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    canvas.addEventListener('touchmove',  this._onTouchMove,  { passive: false });
    canvas.addEventListener('touchend',   this._onTouchEnd);

    // Periodic initial splats to kick-start the field
    this._initialSplats();
  }

  // --- Overlay canvas for drawing theorem circle ---
  _setupOverlay() {
    const oc = document.createElement('canvas');
    oc.id = 'theorem-overlay';
    oc.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    this.canvas.parentNode.insertBefore(oc, this.canvas.nextSibling);
    this.fluidOverlayCanvas = oc;
    this.overlayCtx = oc.getContext('2d');
    this._resizeOverlay();
  }

  _resizeOverlay() {
    const oc = this.fluidOverlayCanvas;
    if (!oc) return;
    const dpr = window.devicePixelRatio || 1;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    oc.width = w * dpr;
    oc.height = h * dpr;
    oc.style.width = w + 'px';
    oc.style.height = h + 'px';
    this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // --- Cursor -> canvas-space [0..1] ---

  _toCanvasSpace(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height
    };
  }

  // --- Color cycle ---

  _cycleColor(dt) {
    // HSV rotation: shift hue slightly each frame
    this.colorTimer += dt * 0.3;
    const h = (this.colorTimer % 1 + 1) % 1;
    const c = this._HSVtoRGB(h, 1.0, 1.0);
    this.color = { r: c.r * 0.15, g: c.g * 0.15, b: c.b * 0.15 };
  }

  _HSVtoRGB(h, s, v) {
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    return { r, g, b };
  }

  // --- Event handlers ---

  _handleMouseDown(e) {
    this.mouseDown = true;
    const pos = this._toCanvasSpace(e);
    this.cursor.prevX = pos.x;
    this.cursor.prevY = pos.y;
    this.cursor.x = pos.x;
    this.cursor.y = pos.y;
  }

  _handleMouseMove(e) {
    const pos = this._toCanvasSpace(e);
    this.cursor.prevX = this.cursor.x;
    this.cursor.prevY = this.cursor.y;
    this.cursor.x = pos.x;
    this.cursor.y = pos.y;
  }

  _handleMouseUp() {
    this.mouseDown = false;
  }

  _handleTouchStart(e) {
    e.preventDefault();
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const pos = this._toCanvasSpace(touch);
    this.cursor.prevX = pos.x;
    this.cursor.prevY = pos.y;
    this.cursor.x = pos.x;
    this.cursor.y = pos.y;
    this.mouseDown = true;
  }

  _handleTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 0) return;
    const touch = e.touches[0];
    const pos = this._toCanvasSpace(touch);
    this.cursor.prevX = this.cursor.x;
    this.cursor.prevY = this.cursor.y;
    this.cursor.x = pos.x;
    this.cursor.y = pos.y;
  }

  _handleTouchEnd() {
    this.mouseDown = false;
  }

  // --- Kick-start the field ---

  _initialSplats() {
    // Seed the field with a few random velocity + dye splats
    for (let i = 0; i < 8; i++) {
      const x = 0.2 + Math.random() * 0.6;
      const y = 0.2 + Math.random() * 0.6;
      const dx = (Math.random() - 0.5) * 3000;
      const dy = (Math.random() - 0.5) * 3000;
      const c = this._HSVtoRGB(Math.random(), 1.0, 1.0);
      this.fluid.splat(x, y, dx, dy, {
        r: c.r * 0.15 * 10,
        g: c.g * 0.15 * 10,
        b: c.b * 0.15 * 10
      });
    }
  }

  // --- Update theorem radius ---

  setRadius(r) {
    this.tRadius = r;
  }

  // --- Main simulation step ---

  step(dt) {
    if (!this.fluid) return;

    // Splat if cursor moved
    const dx = this.cursor.x - this.cursor.prevX;
    const dy = this.cursor.y - this.cursor.prevY;
    const moved = Math.abs(dx) > 0.0001 || Math.abs(dy) > 0.0001;

    if (moved) {
      const force = this.mouseDown ? 6000 : 2000;
      const sx = dx * force;
      const sy = dy * force;

      this._cycleColor(dt);
      const col = this.mouseDown
        ? { r: this.color.r * 2, g: this.color.g * 2, b: this.color.b * 2 }
        : this.color;

      this.fluid.splat(this.cursor.x, this.cursor.y, sx, -sy, col);
      this.cursor.prevX = this.cursor.x;
      this.cursor.prevY = this.cursor.y;
    }

    // Simulation step
    this.fluid.step(dt);

    // Render dye to canvas
    this.fluid.render();

    // Resize overlay if needed
    this._resizeOverlay();

    // Update theorem
    this.theorem.update(this.cursor.x, this.cursor.y, this.tRadius, this.fluid);

    // Draw theorem circle on overlay
    this.overlayCtx.clearRect(0, 0, this.fluidOverlayCanvas.width, this.fluidOverlayCanvas.height);
    this.theorem.render(this.overlayCtx);

    // Notify UI
    if (this.onTheoremUpdate) {
      this.onTheoremUpdate(this.theorem.getValues());
    }
  }

  // --- Cleanup ---

  dispose() {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);

    if (this.fluidOverlayCanvas) {
      this.fluidOverlayCanvas.remove();
      this.fluidOverlayCanvas = null;
    }

    if (this.fluid) {
      this.fluid.dispose();
      this.fluid = null;
    }
  }
}
