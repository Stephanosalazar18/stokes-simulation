// Adapted from PavelDoGreat/WebGL-Fluid-Simulation (MIT)
// https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
//
// Simplified: removed bloom, sunrays, shading, GUI, mobile promo.
// Kept core Stam stable fluids pipeline: advection, diffusion, pressure projection,
// vorticity confinement, dye + velocity splats.

// --- Shader helpers ---

function compileShader(gl, type, source, keywords) {
  if (keywords && keywords.length) {
    const defs = keywords.map(k => `#define ${k}\n`).join('');
    source = defs + source;
  }
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
    console.error(gl.getShaderInfoLog(shader));
  return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    console.error(gl.getProgramInfoLog(program));
  return program;
}

function getUniforms(gl, program) {
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }
  return uniforms;
}

// --- Color helpers ---

function HSVtoRGB(h, s, v) {
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

function generateColor() {
  const c = HSVtoRGB(Math.random(), 1.0, 1.0);
  return { r: c.r * 0.15, g: c.g * 0.15, b: c.b * 0.15 };
}

// --- GLSL shader sources ---

const baseVertexSource = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
out vec2 vL, vR, vT, vB;
uniform vec2 texelSize;

void main() {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const copySource = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv;
uniform sampler2D uTexture;
out vec4 fragColor;

void main() {
  fragColor = texture(uTexture, vUv);
}`;

const clearSource = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
out vec4 fragColor;

void main() {
  fragColor = value * texture(uTexture, vUv);
}`;

const displaySource = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uTexture;
out vec4 fragColor;

void main() {
  vec3 c = texture(uTexture, vUv).rgb;
  float a = max(c.r, max(c.g, c.b));
  fragColor = vec4(c, a);
}`;

const splatSource = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
out vec4 fragColor;

void main() {
  vec2 p = vUv - point.xy;
  p.x *= aspectRatio;
  vec3 splat = exp(-dot(p, p) / radius) * color;
  vec3 base = texture(uTarget, vUv).xyz;
  fragColor = vec4(base + splat, 1.0);
}`;

const advectionSource = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
#ifdef MANUAL_FILTERING
uniform vec2 dyeTexelSize;
#endif
out vec4 fragColor;

vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}

void main() {
#ifdef MANUAL_FILTERING
  vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
  vec4 result = bilerp(uSource, coord, dyeTexelSize);
#else
  vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
  vec4 result = texture(uSource, coord);
#endif
  float decay = 1.0 + dissipation * dt;
  fragColor = result / decay;
}`;

const divergenceSource = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity;
out vec4 fragColor;

void main() {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  float div = 0.5 * (R - L + T - B);
  fragColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const curlSource = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity;
out vec4 fragColor;

void main() {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  fragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}`;

const vorticitySource = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
out vec4 fragColor;

void main() {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity += force * dt;
  velocity = clamp(velocity, -1000.0, 1000.0);
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

const pressureSource = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
out vec4 fragColor;

void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float C = texture(uPressure, vUv).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  fragColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

const gradientSubtractSource = `#version 300 es
precision mediump float;
precision mediump sampler2D;
in highp vec2 vUv, vL, vR, vT, vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
out vec4 fragColor;

void main() {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  fragColor = vec4(velocity, 0.0, 1.0);
}`;

// --- Helper: render-to-quad blit ---

function setupBlit(gl) {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
}

function blit(gl, target) {
  if (target == null) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  } else {
    gl.viewport(0, 0, target.width, target.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  }
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
}

// --- FBO helpers ---

function createFBO(gl, ext, w, h, internalFormat, format, type, filter) {
  gl.activeTexture(gl.TEXTURE0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT);

  return {
    texture, fbo,
    width: w, height: h,
    texelSizeX: 1.0 / w, texelSizeY: 1.0 / h,
    attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; }
  };
}

function createDoubleFBO(gl, ext, w, h, internalFormat, format, type, filter) {
  const fbo1 = createFBO(gl, ext, w, h, internalFormat, format, type, filter);
  const fbo2 = createFBO(gl, ext, w, h, internalFormat, format, type, filter);
  return {
    width: w, height: h,
    texelSizeX: 1.0 / w, texelSizeY: 1.0 / h,
    read: fbo1, write: fbo2,
    swap() { const tmp = this.read; this.read = this.write; this.write = tmp; }
  };
}

function getResolution(gl, resolution) {
  let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
  if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
  const min = Math.round(resolution);
  const max = Math.round(resolution * aspectRatio);
  if (gl.drawingBufferWidth > gl.drawingBufferHeight)
    return { width: max, height: min };
  else
    return { width: min, height: max };
}

function scaleByPixelRatio(input) {
  return Math.floor(input * (window.devicePixelRatio || 1));
}

// --- Main FluidSim class ---

export class FluidSim {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.ext = null;
    this.dye = null;
    this.velocity = null;
    this.divergence = null;
    this.curl = null;
    this.pressure = null;

    // Programs (set up by initWebGL)
    this.copyProgram = null;
    this.clearProgram = null;
    this.splatProgram = null;
    this.advectionProgram = null;
    this.divergenceProgram = null;
    this.curlProgram = null;
    this.vorticityProgram = null;
    this.pressureProgram = null;
    this.gradientSubtractProgram = null;
    this.displayProgram = null;

    // Config
    this.simRes = 128;
    this.dyeRes = 512;
    this.densityDissipation = 1.0;
    this.velocityDissipation = 0.2;
    this.pressureValue = 0.8;
    this.pressureIterations = 20;
    this.curlStrength = 30;

    this.initWebGL();
  }

  // --- WebGL init ---

  initWebGL() {
    const canvas = this.canvas;
    const params = { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };

    let gl = canvas.getContext('webgl2', params);
    let isWebGL2 = !!gl;
    if (!isWebGL2)
      gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);

    if (!gl) throw new Error('WebGL not supported');

    let halfFloat;
    let supportLinearFiltering;
    if (isWebGL2) {
      gl.getExtension('EXT_color_buffer_float');
      supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
    } else {
      halfFloat = gl.getExtension('OES_texture_half_float');
      supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);

    const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
    const MANUAL_FILTERING = !supportLinearFiltering;

    this.gl = gl;
    this.ext = {
      formatRGBA: isWebGL2 ? { internalFormat: gl.RGBA16F, format: gl.RGBA } : { internalFormat: gl.RGBA, format: gl.RGBA },
      formatRG:   isWebGL2 ? { internalFormat: gl.RG16F,   format: gl.RG }   : { internalFormat: gl.RGBA, format: gl.RGBA },
      formatR:    isWebGL2 ? { internalFormat: gl.R16F,    format: gl.RED }   : { internalFormat: gl.RGBA, format: gl.RGBA },
      halfFloatTexType,
      supportLinearFiltering,
      isWebGL2
    };

    // Compile shaders
    const baseVertex = compileShader(gl, gl.VERTEX_SHADER, baseVertexSource);
    const advectionKeywords = MANUAL_FILTERING ? ['MANUAL_FILTERING'] : null;

    this.copyProgram            = { program: createProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, copySource)),                uniforms: null };
    this.clearProgram           = { program: createProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, clearSource)),               uniforms: null };
    this.splatProgram           = { program: createProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, splatSource)),               uniforms: null };
    this.advectionProgram       = { program: createProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, advectionSource, advectionKeywords)), uniforms: null };
    this.divergenceProgram      = { program: createProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, divergenceSource)),          uniforms: null };
    this.curlProgram            = { program: createProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, curlSource)),                uniforms: null };
    this.vorticityProgram       = { program: createProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, vorticitySource)),           uniforms: null };
    this.pressureProgram        = { program: createProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, pressureSource)),            uniforms: null };
    this.gradientSubtractProgram= { program: createProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, gradientSubtractSource)),    uniforms: null };
    this.displayProgram         = { program: createProgram(gl, baseVertex, compileShader(gl, gl.FRAGMENT_SHADER, displaySource)),             uniforms: null };

    // Cache uniforms
    for (const p of [this.copyProgram, this.clearProgram, this.splatProgram, this.advectionProgram,
                     this.divergenceProgram, this.curlProgram, this.vorticityProgram,
                     this.pressureProgram, this.gradientSubtractProgram, this.displayProgram]) {
      p.uniforms = getUniforms(gl, p.program);
    }

    setupBlit(gl);
    this.resizeCanvas();
    this.initFramebuffers();
  }

  // --- Framebuffers ---

  initFramebuffers() {
    const gl = this.gl;
    const ext = this.ext;
    const simRes = getResolution(gl, this.simRes);
    const dyeRes = getResolution(gl, this.dyeRes);
    const texType = ext.halfFloatTexType;
    const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;

    gl.disable(gl.BLEND);

    if (this.dye == null)
      this.dye = createDoubleFBO(gl, ext, dyeRes.width, dyeRes.height, ext.formatRGBA.internalFormat, ext.formatRGBA.format, texType, filtering);
    if (this.velocity == null)
      this.velocity = createDoubleFBO(gl, ext, simRes.width, simRes.height, ext.formatRG.internalFormat, ext.formatRG.format, texType, filtering);

    this.divergence = createFBO(gl, ext, simRes.width, simRes.height, ext.formatR.internalFormat, ext.formatR.format, texType, gl.NEAREST);
    this.curl       = createFBO(gl, ext, simRes.width, simRes.height, ext.formatR.internalFormat, ext.formatR.format, texType, gl.NEAREST);
    this.pressure   = createDoubleFBO(gl, ext, simRes.width, simRes.height, ext.formatR.internalFormat, ext.formatR.format, texType, gl.NEAREST);
  }

  // --- Resize ---

  resizeCanvas() {
    const canvas = this.canvas;
    const w = scaleByPixelRatio(canvas.clientWidth);
    const h = scaleByPixelRatio(canvas.clientHeight);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  }

  resize(w, h) {
    const canvas = this.canvas;
    canvas.width = w;
    canvas.height = h;
    this.initFramebuffers();
  }

  // --- Splat ---

  splat(x, y, dx, dy, color) {
    const gl = this.gl;
    const canvas = this.canvas;
    const p = this.splatProgram;
    gl.useProgram(p.program);

    // Compute corrected radius
    let radius = 0.0025;
    const aspect = canvas.width / canvas.height;
    if (aspect > 1) radius *= aspect;

    // Splat velocity
    gl.uniform1i(p.uniforms.uTarget, this.velocity.read.attach(0));
    gl.uniform1f(p.uniforms.aspectRatio, aspect);
    gl.uniform2f(p.uniforms.point, x, y);
    gl.uniform3f(p.uniforms.color, dx, dy, 0.0);
    gl.uniform1f(p.uniforms.radius, radius);
    blit(gl, this.velocity.write);
    this.velocity.swap();

    // Splat dye
    gl.uniform1i(p.uniforms.uTarget, this.dye.read.attach(0));
    gl.uniform3f(p.uniforms.color, color.r, color.g, color.b);
    blit(gl, this.dye.write);
    this.dye.swap();
  }

  // --- Simulation step ---

  step(dt) {
    const gl = this.gl;
    gl.disable(gl.BLEND);

    // Curl
    const cp = this.curlProgram;
    gl.useProgram(cp.program);
    gl.uniform2f(cp.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(cp.uniforms.uVelocity, this.velocity.read.attach(0));
    blit(gl, this.curl);

    // Vorticity
    const vp = this.vorticityProgram;
    gl.useProgram(vp.program);
    gl.uniform2f(vp.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(vp.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(vp.uniforms.uCurl, this.curl.attach(1));
    gl.uniform1f(vp.uniforms.curl, this.curlStrength);
    gl.uniform1f(vp.uniforms.dt, dt);
    blit(gl, this.velocity.write);
    this.velocity.swap();

    // Divergence
    const dp = this.divergenceProgram;
    gl.useProgram(dp.program);
    gl.uniform2f(dp.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(dp.uniforms.uVelocity, this.velocity.read.attach(0));
    blit(gl, this.divergence);

    // Clear pressure
    const clp = this.clearProgram;
    gl.useProgram(clp.program);
    gl.uniform1i(clp.uniforms.uTexture, this.pressure.read.attach(0));
    gl.uniform1f(clp.uniforms.value, this.pressureValue);
    blit(gl, this.pressure.write);
    this.pressure.swap();

    // Pressure solve
    const pp = this.pressureProgram;
    gl.useProgram(pp.program);
    gl.uniform2f(pp.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(pp.uniforms.uDivergence, this.divergence.attach(0));
    for (let i = 0; i < this.pressureIterations; i++) {
      gl.uniform1i(pp.uniforms.uPressure, this.pressure.read.attach(1));
      blit(gl, this.pressure.write);
      this.pressure.swap();
    }

    // Gradient subtract
    const gp = this.gradientSubtractProgram;
    gl.useProgram(gp.program);
    gl.uniform2f(gp.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    gl.uniform1i(gp.uniforms.uPressure, this.pressure.read.attach(0));
    gl.uniform1i(gp.uniforms.uVelocity, this.velocity.read.attach(1));
    blit(gl, this.velocity.write);
    this.velocity.swap();

    // Advection velocity
    const ap = this.advectionProgram;
    gl.useProgram(ap.program);
    gl.uniform2f(ap.uniforms.texelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    if (!this.ext.supportLinearFiltering)
      gl.uniform2f(ap.uniforms.dyeTexelSize, this.velocity.texelSizeX, this.velocity.texelSizeY);
    const velId = this.velocity.read.attach(0);
    gl.uniform1i(ap.uniforms.uVelocity, velId);
    gl.uniform1i(ap.uniforms.uSource, velId);
    gl.uniform1f(ap.uniforms.dt, dt);
    gl.uniform1f(ap.uniforms.dissipation, this.velocityDissipation);
    blit(gl, this.velocity.write);
    this.velocity.swap();

    // Advection dye
    if (!this.ext.supportLinearFiltering)
      gl.uniform2f(ap.uniforms.dyeTexelSize, this.dye.texelSizeX, this.dye.texelSizeY);
    gl.uniform1i(ap.uniforms.uVelocity, this.velocity.read.attach(0));
    gl.uniform1i(ap.uniforms.uSource, this.dye.read.attach(1));
    gl.uniform1f(ap.uniforms.dissipation, this.densityDissipation);
    blit(gl, this.dye.write);
    this.dye.swap();
  }

  // --- Render dye to canvas ---

  render() {
    const gl = this.gl;
    gl.disable(gl.BLEND);

    const dsp = this.displayProgram;
    gl.useProgram(dsp.program);
    gl.uniform1i(dsp.uniforms.uTexture, this.dye.read.attach(0));
    blit(gl, null);
  }

  // --- Get velocity field for theorem computation ---

  getVelocityField() {
    const gl = this.gl;
    const w = this.velocity.width;
    const h = this.velocity.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocity.read.fbo);
    const data = new Float32Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, data);

    const u = new Float32Array(w * h);
    const v = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      u[i] = data[4 * i];
      v[i] = data[4 * i + 1];
    }
    return { u, v, width: w, height: h };
  }

  // --- Cleanup ---

  dispose() {
    const gl = this.gl;
    if (!gl) return;
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  }
}
