const SIM_WIDTH = 512;
const SIM_HEIGHT = 512;
const JACOBI_ITERATIONS = 20;
const SPLAT_FORCE = 6000;
const SPLAT_RADIUS = 0.0008;

// --- SHADERS ---

const baseVertexShader = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const advectionFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
uniform vec2 uResolution;
uniform float uDt;
in vec2 vUv;
out vec4 fragColor;

void main() {
    ivec2 fc = ivec2(gl_FragCoord.xy);
    vec4 o = texelFetch(uVelocity, fc, 0);
    vec4 n = texelFetch(uVelocity, fc + ivec2(0, 1), 0);
    vec4 e = texelFetch(uVelocity, fc + ivec2(1, 0), 0);
    vec4 s = texelFetch(uVelocity, fc + ivec2(0, -1), 0);
    vec4 w = texelFetch(uVelocity, fc + ivec2(-1, 0), 0);

    vec4 a = texture(uVelocity, (gl_FragCoord.xy - o.xy * uDt) / uResolution);
    fragColor = a;

    if (fc.x == 0) {
        fragColor.xy = -e.xy;
        fragColor.z = e.z;
        fragColor.w = 0.0;
    }
    if (fc.y == 0) {
        fragColor.xy = -n.xy;
        fragColor.z = n.z;
        fragColor.w = 0.0;
    }
    if (fc.x == int(uResolution.x) - 1) {
        fragColor.xy = -w.xy;
        fragColor.z = w.z;
        fragColor.w = 0.0;
    }
    if (fc.y == int(uResolution.y) - 1) {
        fragColor.xy = -s.xy;
        fragColor.z = s.z;
        fragColor.w = 0.0;
    }
}`;

const jacobiFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
uniform float uDx;
in vec2 vUv;
out vec4 fragColor;

void main() {
    ivec2 fc = ivec2(gl_FragCoord.xy);
    vec4 o = texelFetch(uVelocity, fc, 0);
    vec4 n = texelFetch(uVelocity, fc + ivec2(0, 1), 0);
    vec4 e = texelFetch(uVelocity, fc + ivec2(1, 0), 0);
    vec4 s = texelFetch(uVelocity, fc + ivec2(0, -1), 0);
    vec4 w = texelFetch(uVelocity, fc + ivec2(-1, 0), 0);

    float div = (e.x - w.x + n.y - s.y) / (2.0 * uDx * uDx);
    float a = 1.0 / (uDx * uDx);
    float p = 1.0 / (-4.0 * a) * (div - a * (n.z + e.z + s.z + w.z));

    fragColor = vec4(o.xy, p, o.w);
}`;

const projectionFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
uniform float uDx;
in vec2 vUv;
out vec4 fragColor;

void main() {
    ivec2 fc = ivec2(gl_FragCoord.xy);
    vec4 o = texelFetch(uVelocity, fc, 0);
    vec4 n = texelFetch(uVelocity, fc + ivec2(0, 1), 0);
    vec4 e = texelFetch(uVelocity, fc + ivec2(1, 0), 0);
    vec4 s = texelFetch(uVelocity, fc + ivec2(0, -1), 0);
    vec4 w = texelFetch(uVelocity, fc + ivec2(-1, 0), 0);

    vec2 grad = vec2(e.z - w.z, n.z - s.z) / (2.0 * uDx * uDx);
    fragColor = vec4(o.xy - grad, o.zw);
}`;

const splatFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uTarget;
uniform float uAspectRatio;
uniform vec2 uPoint;
uniform vec4 uColor;
uniform float uRadius;
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec2 p = vUv - uPoint;
    p.x *= uAspectRatio;
    vec4 splat = exp(-dot(p, p) / uRadius) * uColor;
    vec4 base = texture(uTarget, vUv);
    fragColor = base + splat;
}`;

const displayFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4 c = texture(uVelocity, vUv);
    fragColor = vec4(vec3(c.w), 1.0);
}`;

// --- UTILIDADES WEBGL ---

function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }

    const uniforms = {};
    const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < uniformCount; i++) {
        const uniformName = gl.getActiveUniform(program, i).name;
        uniforms[uniformName] = gl.getUniformLocation(program, uniformName);
    }

    return { program, uniforms };
}

function createFBO(gl, width, height) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);

    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    gl.viewport(0, 0, width, height);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { texture, fbo, width, height };
}

function createDoubleFBO(gl, width, height) {
    return {
        read: createFBO(gl, width, height),
        write: createFBO(gl, width, height),
        swap() {
            const temp = this.read;
            this.read = this.write;
            this.write = temp;
        }
    };
}

// --- CLASE PRINCIPAL ---

class FluidSimulation {
    constructor(canvas) {
        this.canvas = canvas;
        this.frameCount = 0;
        this.gl = canvas.getContext('webgl2', {
            alpha: false,
            depth: false,
            stencil: false,
            antialias: false,
            preserveDrawingBuffer: false
        });

        if (!this.gl) throw new Error('WebGL2 no soportado');

        const gl = this.gl;
        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('OES_texture_float_linear');
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.clearColor(0.0, 0.0, 0.0, 0);

        this.mouse = { x: 0, y: 0, prevX: 0, prevY: 0, dx: 0, dy: 0, down: false, moved: false };
        this.dt = 1.0;
        this.dx = 1.0;

        this.initShaders();
        this.initBuffers();
        this.initFBOs();
        this.initEvents();
    }

    initShaders() {
        const gl = this.gl;
        const vs = compileShader(gl, gl.VERTEX_SHADER, baseVertexShader);
        if (!vs) throw new Error('Vertex shader failed');

        this.advectionProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, advectionFragmentShader));
        this.jacobiProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, jacobiFragmentShader));
        this.projectionProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, projectionFragmentShader));
        this.splatProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, splatFragmentShader));
        this.displayProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, displayFragmentShader));

        if (!this.advectionProgram || !this.jacobiProgram || !this.projectionProgram || !this.splatProgram || !this.displayProgram) {
            throw new Error('Program creation failed');
        }
    }

    initBuffers() {
        const gl = this.gl;
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1,  -1, 1,  1, 1
        ]), gl.STATIC_DRAW);

        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    initFBOs() {
        const gl = this.gl;
        this.velocityFBO = createDoubleFBO(gl, SIM_WIDTH, SIM_HEIGHT);
    }

    initEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.mouse.down = true;
            this.mouse.moved = false;
            this.updatePointer(e);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.mouse.down) return;
            this.updatePointer(e);
        });

        window.addEventListener('mouseup', () => {
            this.mouse.down = false;
        });

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.mouse.down = true;
            this.mouse.moved = false;
            const t = e.targetTouches[0];
            this.updatePointerFromCoords(t.pageX, t.pageY);
        });

        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!this.mouse.down) return;
            const t = e.targetTouches[0];
            this.updatePointerFromCoords(t.pageX, t.pageY);
        });

        window.addEventListener('touchend', () => {
            this.mouse.down = false;
        });
    }

    updatePointer(e) {
        this.updatePointerFromCoords(e.clientX, e.clientY);
    }

    updatePointerFromCoords(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.prevX = this.mouse.x;
        this.mouse.prevY = this.mouse.y;
        this.mouse.x = (clientX - rect.left) / rect.width;
        this.mouse.y = 1.0 - (clientY - rect.top) / rect.height;
        this.mouse.dx = this.mouse.x - this.mouse.prevX;
        this.mouse.dy = this.mouse.y - this.mouse.prevY;
        this.mouse.moved = Math.abs(this.mouse.dx) > 0 || Math.abs(this.mouse.dy) > 0;
    }

    blit(target) {
        const gl = this.gl;
        if (target) {
            gl.viewport(0, 0, target.width, target.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
        } else {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }

    splat(x, y, dx, dy) {
        const gl = this.gl;

        gl.useProgram(this.splatProgram.program);
        gl.uniform1i(this.splatProgram.uniforms.uTarget, 0);
        gl.uniform1f(this.splatProgram.uniforms.uAspectRatio, this.canvas.width / this.canvas.height);
        gl.uniform2f(this.splatProgram.uniforms.uPoint, x, y);
        gl.uniform4f(this.splatProgram.uniforms.uColor, dx * SPLAT_FORCE, dy * SPLAT_FORCE, 0.0, 1.0);
        gl.uniform1f(this.splatProgram.uniforms.uRadius, SPLAT_RADIUS);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture);

        this.blit(this.velocityFBO.write);
        this.velocityFBO.swap();
    }

    step() {
        const gl = this.gl;

        if (this.mouse.down && this.mouse.moved) {
            this.splat(this.mouse.x, this.mouse.y, this.mouse.dx, this.mouse.dy);
            this.mouse.moved = false;
        }

        gl.useProgram(this.advectionProgram.program);
        gl.uniform2f(this.advectionProgram.uniforms.uResolution, SIM_WIDTH, SIM_HEIGHT);
        gl.uniform1f(this.advectionProgram.uniforms.uDt, this.dt);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture);
        gl.uniform1i(this.advectionProgram.uniforms.uVelocity, 0);

        this.blit(this.velocityFBO.write);
        this.velocityFBO.swap();

        gl.useProgram(this.jacobiProgram.program);
        gl.uniform1f(this.jacobiProgram.uniforms.uDx, this.dx);

        for (let i = 0; i < JACOBI_ITERATIONS; i++) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture);
            gl.uniform1i(this.jacobiProgram.uniforms.uVelocity, 0);

            this.blit(this.velocityFBO.write);
            this.velocityFBO.swap();
        }

        gl.useProgram(this.projectionProgram.program);
        gl.uniform1f(this.projectionProgram.uniforms.uDx, this.dx);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture);
        gl.uniform1i(this.projectionProgram.uniforms.uVelocity, 0);

        this.blit(this.velocityFBO.write);
        this.velocityFBO.swap();
    }

    render() {
        const gl = this.gl;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(this.displayProgram.program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture);
        gl.uniform1i(this.displayProgram.uniforms.uVelocity, 0);

        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }
}

// --- RENDER LOOP ---

const canvas = document.getElementById('canvas');
const sim = new FluidSimulation(canvas);

function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
}

window.addEventListener('resize', resize);
resize();

function loop() {
    sim.step();
    sim.render();
    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
