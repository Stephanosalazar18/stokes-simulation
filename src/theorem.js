// Stokes Theorem Overlay — computes ∮F·dr and ∬(∇×F)·dS
// on a circle C that follows the cursor over a fluid velocity field.

export class TheoremOverlay {
  constructor() {
    this.radius = 0.15;        // default C radius in canvas-space [0..1]
    this.cursorX = 0.5;
    this.cursorY = 0.5;
    this.lineIntegral = 0;
    this.surfaceIntegral = 0;
    this.ratio = 0;
  }

  /**
   * Sample the velocity field at (x,y) in canvas-space [0..1]
   * using bilinear interpolation.
   */
  sampleField(uField, vField, w, h, x, y) {
    // Map [0,1] to pixel coordinates
    let px = x * (w - 1);
    let py = (1.0 - y) * (h - 1);   // WebGL has Y inverted; GPU data is bottom-up

    const x0 = Math.floor(px);
    const y0 = Math.floor(py);
    const x1 = Math.min(x0 + 1, w - 1);
    const y1 = Math.min(y0 + 1, h - 1);

    const fx = px - x0;
    const fy = py - y0;

    const cx0 = 1 - fx, cx1 = fx;
    const cy0 = 1 - fy, cy1 = fy;

    const i00 = y0 * w + x0;
    const i10 = y0 * w + x1;
    const i01 = y1 * w + x0;
    const i11 = y1 * w + x1;

    const u = cx0 * (cy0 * uField[i00] + cy1 * uField[i01])
            + cx1 * (cy0 * uField[i10] + cy1 * uField[i11]);
    const v_ = cx0 * (cy0 * vField[i00] + cy1 * vField[i01])
             + cx1 * (cy0 * vField[i10] + cy1 * vField[i11]);

    return { u, v: v_ };
  }

  /**
   * Compute line integral ∮F·dr around circle C centered at cursor.
   * N-sample trapezoidal rule.
   */
  computeLineIntegral(uField, vField, w, h) {
    const N = 128;
    const cx = this.cursorX;
    const cy = this.cursorY;
    const r = this.radius;
    let sum = 0;

    for (let i = 0; i < N; i++) {
      const theta = (2 * Math.PI * i) / N;
      const x = cx + r * Math.cos(theta);
      const y = cy + r * Math.sin(theta);

      // Clamp to valid field range
      const sx = Math.max(0, Math.min(1, x));
      const sy = Math.max(0, Math.min(1, y));

      const { u, v: uv } = this.sampleField(uField, vField, w, h, sx, sy);

      // dr = (-r*sin(θ), r*cos(θ)) * dθ  with dθ = 2π/N
      const dtheta = (2 * Math.PI) / N;
      sum += u * (-r * Math.sin(theta)) + uv * (r * Math.cos(theta));
    }

    return sum;
  }

  /**
   * Compute surface integral ∬(∇×F)·dS using midpoint rule.
   * 2D curl = ∂v/∂x - ∂u/∂y. Only grid points inside circle C are summed.
   */
  computeSurfaceIntegral(uField, vField, w, h) {
    const cx = this.cursorX;
    const cy = this.cursorY;
    const r = this.radius;

    // Map canvas-space radius to pixel-space
    const rpx = r * w;

    const cxPx = cx * (w - 1);
    const cyPx = (1.0 - cy) * (h - 1);  // GPU Y-inverted

    // Search bounds in pixel space
    const xMin = Math.max(0, Math.floor(cxPx - rpx - 1));
    const xMax = Math.min(w - 2, Math.ceil(cxPx + rpx + 1));
    const yMin = Math.max(0, Math.floor(cyPx - rpx - 1));
    const yMax = Math.min(h - 2, Math.ceil(cyPx + rpx + 1));

    // Pixel area in canvas-space
    const dx = 1.0 / (w - 1);
    const dy = 1.0 / (h - 1);
    const dA = dx * dy;

    let sum = 0;

    for (let iy = yMin; iy <= yMax; iy++) {
      for (let ix = xMin; ix <= xMax; ix++) {
        // Convert pixel to canvas-space [0..1]
        const sy = 1.0 - (iy + 0.5) / (h - 1);
        const sx = (ix + 0.5) / (w - 1);

        const dxCS = sx - cx;
        const dyCS = sy - cy;
        if (dxCS * dxCS + dyCS * dyCS > r * r) continue;

        // Central difference curl: ∂v/∂x - ∂u/∂y
        const idx = iy * w + ix;
        const dvdx = (vField[idx + 1] - vField[idx - 1]) / (2 * dx);
        const dudy = (uField[idx + w] - uField[idx - w]) / (2 * dy);

        sum += (dvdx - dudy) * dA;
      }
    }

    return sum;
  }

  /**
   * Update integrals from current velocity field and cursor position.
   */
  update(cursorX, cursorY, radius, fluidSim) {
    this.cursorX = cursorX;
    this.cursorY = cursorY;
    this.radius = radius;

    const field = fluidSim.getVelocityField();
    this.lineIntegral = this.computeLineIntegral(field.u, field.v, field.width, field.height);
    this.surfaceIntegral = this.computeSurfaceIntegral(field.u, field.v, field.width, field.height);
    this.ratio = Math.abs(this.surfaceIntegral) > 1e-8
      ? this.lineIntegral / this.surfaceIntegral
      : 0;
    // Clamp ratio to ±10 for safety
    this.ratio = Math.max(-10, Math.min(10, this.ratio));
  }

  /**
   * Return current integral values.
   */
  getValues() {
    return {
      lineIntegral: this.lineIntegral,
      surfaceIntegral: this.surfaceIntegral,
      ratio: this.ratio
    };
  }

  /**
   * Draw the circle C on a 2D canvas context.
   */
  render(ctx) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const cx = this.cursorX * w;
    const cy = this.cursorY * h;
    const r = this.radius * Math.min(w, h);

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 50, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.stroke();

    // Label "C"
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 255, 50, 0.9)';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('C', cx, cy - r - 6);

    ctx.restore();
  }
}
