import {
    baseVertexShader, advectionFragmentShader, jacobiFragmentShader,
    projectionFragmentShader, splatFragmentShader, displayFragmentShader, sourceFragmentShader,
    initUVFragmentShader, uvAdvectionFragmentShader, displayImageFragmentShader // SHADERS UV
} from './shaders.js';
import { compileShader, createProgram, createDoubleFBO } from './webgl-utils.js';
import { ObstacleManager } from './obstacle-manager.js';

export const SIM_WIDTH = 512;
export const SIM_HEIGHT = 512;
const JACOBI_ITERATIONS = 20;

export class FluidSimulation {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false });
        if (!this.gl) throw new Error('WebGL2 no soportado');

        const gl = this.gl;
        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('OES_texture_float_linear');
        gl.clearColor(0.0, 0.0, 0.0, 0);

        this.obstacleManager = new ObstacleManager(canvas);
        
        this.windTunnelMode = true;
        this.imageMode = false;
        this.currentImageElement = null;
        this.imageTexture = null;
        
        this.inletVelocity = 5.0;
        this.inletSize = 0.050;
        this.smokeDecay = 0.999;
        this.splatForce = 400;
        this.splatRadius = 0.0015;

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
        
        this.advectionProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, advectionFragmentShader));
        this.jacobiProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, jacobiFragmentShader));
        this.projectionProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, projectionFragmentShader));
        this.splatProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, splatFragmentShader));
        this.displayProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, displayFragmentShader));
        this.sourceProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, sourceFragmentShader));
        
        // Programas de Coordenadas
        this.initUVProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, initUVFragmentShader));
        this.uvAdvectionProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, uvAdvectionFragmentShader));
        this.displayImageProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, displayImageFragmentShader));
    }

    initBuffers() {
        const gl = this.gl;
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);
    }

    initFBOs() {
        this.velocityFBO = createDoubleFBO(this.gl, SIM_WIDTH, SIM_HEIGHT);
        this.uvFBO = createDoubleFBO(this.gl, SIM_WIDTH, SIM_HEIGHT); 
    }

    resetUVs() {
        const gl = this.gl;
        gl.useProgram(this.initUVProgram.program);
        this.blit(this.uvFBO.read);
        this.blit(this.uvFBO.write);
    }

    setImage(imageElement) {
        this.currentImageElement = imageElement;
        const gl = this.gl;
        
        if (this.imageTexture) gl.deleteTexture(this.imageTexture);
        this.imageTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageElement);

        this.imageMode = true;
        this.clearFluid(); // Borra velocidad y restaura el mapa UV al estado inicial intacto
    }

    clearFluid() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO.read.fbo);
        gl.clearColor(0.0, 0.0, 0.0, 0.0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO.write.fbo);
        gl.clearColor(0.0, 0.0, 0.0, 0.0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        if (this.imageMode) {
            this.resetUVs(); // Reinicia la imagen a cero deformación
        }
    }

    initEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.mouse.down = true;
            this.updatePointerCoords(e.clientX, e.clientY, true);
        });
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.mouse.down) return;
            this.updatePointerCoords(e.clientX, e.clientY, false);
        });
        window.addEventListener('mouseup', () => { this.mouse.down = false; });
    }

    updatePointerCoords(clientX, clientY, isDown) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = (clientX - rect.left) / rect.width;
        this.mouse.y = 1.0 - (clientY - rect.top) / rect.height;
        if (isDown) {
            this.mouse.prevX = this.mouse.x; this.mouse.prevY = this.mouse.y;
            this.mouse.dx = 0; this.mouse.dy = 0;
        } else {
            this.mouse.dx = this.mouse.x - this.mouse.prevX; this.mouse.dy = this.mouse.y - this.mouse.prevY;
            this.mouse.prevX = this.mouse.x; this.mouse.prevY = this.mouse.y;
        }
        this.mouse.moved = Math.abs(this.mouse.dx) > 0 || Math.abs(this.mouse.dy) > 0;
    }

    blit(target) {
        const gl = this.gl;
        if (target) { gl.viewport(0, 0, target.width, target.height); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); } 
        else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
        gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
    }

    splat(x, y, dx, dy) {
        const gl = this.gl;
        gl.useProgram(this.splatProgram.program);
        gl.uniform1i(this.splatProgram.uniforms.uTarget, 0);
        gl.uniform1f(this.splatProgram.uniforms.uAspectRatio, this.canvas.width / this.canvas.height);
        gl.uniform2f(this.splatProgram.uniforms.uPoint, x, y);
        
        // Si estamos en modo imagen, inyectamos VELOCIDAD pero NADA de humo blanco (0.0)
        const paintDensity = this.imageMode ? 0.0 : 1.0; 
        gl.uniform4f(this.splatProgram.uniforms.uColor, dx * this.splatForce, dy * this.splatForce, 0.0, paintDensity);
        
        gl.uniform1f(this.splatProgram.uniforms.uRadius, this.splatRadius);
        gl.activeTexture(gl.TEXTURE0); 
        gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture);
        this.blit(this.velocityFBO.write); 
        this.velocityFBO.swap();
    }

    step() {
        const gl = this.gl;

        if (this.mouse.down && this.mouse.moved && !this.obstacleManager.isDragging) {
            this.splat(this.mouse.x, this.mouse.y, this.mouse.dx, this.mouse.dy);
            this.mouse.moved = false;
        }

        if (this.windTunnelMode) {
            gl.useProgram(this.sourceProgram.program);
            gl.uniform1i(this.sourceProgram.uniforms.uTarget, 0);
            if (this.sourceProgram.uniforms.uInletVelocity) gl.uniform1f(this.sourceProgram.uniforms.uInletVelocity, this.inletVelocity);
            if (this.sourceProgram.uniforms.uInletSize) gl.uniform1f(this.sourceProgram.uniforms.uInletSize, this.inletSize);
            
            // Si el túnel está encendido en modo imagen, no inyecta humo blanco
            if (this.sourceProgram.uniforms.uInjectDensity !== undefined) {
                gl.uniform1f(this.sourceProgram.uniforms.uInjectDensity, this.imageMode ? 0.0 : 1.0);
            }

            gl.activeTexture(gl.TEXTURE0); 
            gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture);
            this.blit(this.velocityFBO.write); 
            this.velocityFBO.swap();
        }

        gl.useProgram(this.advectionProgram.program);
        this.obstacleManager.bindUniforms(gl, this.advectionProgram.uniforms, SIM_WIDTH, SIM_HEIGHT);
        gl.uniform1f(this.advectionProgram.uniforms.uDt, this.dt);
        if (this.advectionProgram.uniforms.uDecay) gl.uniform1f(this.advectionProgram.uniforms.uDecay, this.smokeDecay);
        if (this.advectionProgram.uniforms.uWindTunnel !== undefined) gl.uniform1i(this.advectionProgram.uniforms.uWindTunnel, this.windTunnelMode ? 1 : 0);
        if (this.advectionProgram.uniforms.uInletSize) gl.uniform1f(this.advectionProgram.uniforms.uInletSize, this.inletSize);
        gl.activeTexture(gl.TEXTURE0); 
        gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture);
        gl.uniform1i(this.advectionProgram.uniforms.uVelocity, 0);
        this.blit(this.velocityFBO.write); 
        this.velocityFBO.swap();

        // DEFORMACIÓN PROGRESIVA: Advectamos las Coordenadas UV en lugar del Color
        if (this.imageMode) {
            gl.useProgram(this.uvAdvectionProgram.program);
            gl.uniform2f(this.uvAdvectionProgram.uniforms.uResolution, SIM_WIDTH, SIM_HEIGHT);
            gl.uniform1f(this.uvAdvectionProgram.uniforms.uDt, this.dt);
            
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture);
            gl.uniform1i(this.uvAdvectionProgram.uniforms.uVelocity, 0);
            
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.uvFBO.read.texture);
            gl.uniform1i(this.uvAdvectionProgram.uniforms.uUVMap, 1);
            
            this.blit(this.uvFBO.write);
            this.uvFBO.swap();
        }

        gl.useProgram(this.jacobiProgram.program);
        this.obstacleManager.bindUniforms(gl, this.jacobiProgram.uniforms, SIM_WIDTH, SIM_HEIGHT);
        gl.uniform1f(this.jacobiProgram.uniforms.uDx, this.dx);
        for (let i = 0; i < JACOBI_ITERATIONS; i++) {
            gl.activeTexture(gl.TEXTURE0); 
            gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture);
            gl.uniform1i(this.jacobiProgram.uniforms.uVelocity, 0);
            this.blit(this.velocityFBO.write); 
            this.velocityFBO.swap();
        }

        gl.useProgram(this.projectionProgram.program);
        this.obstacleManager.bindUniforms(gl, this.projectionProgram.uniforms, SIM_WIDTH, SIM_HEIGHT);
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
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (this.imageMode && this.imageTexture) {
            gl.useProgram(this.displayImageProgram.program);
            this.obstacleManager.bindUniforms(gl, this.displayImageProgram.uniforms, SIM_WIDTH, SIM_HEIGHT);
            
            gl.activeTexture(gl.TEXTURE0); 
            gl.bindTexture(gl.TEXTURE_2D, this.uvFBO.read.texture); // Pasamos el mapa deformado
            gl.uniform1i(this.displayImageProgram.uniforms.uUVMap, 0);
            
            gl.activeTexture(gl.TEXTURE1); 
            gl.bindTexture(gl.TEXTURE_2D, this.imageTexture); // Pasamos la foto original pura
            gl.uniform1i(this.displayImageProgram.uniforms.uImage, 1);
            
            if(this.displayImageProgram.uniforms.uImageRes) gl.uniform2f(this.displayImageProgram.uniforms.uImageRes, this.currentImageElement.width, this.currentImageElement.height);
            if(this.displayImageProgram.uniforms.uSimRes) gl.uniform2f(this.displayImageProgram.uniforms.uSimRes, this.canvas.width, this.canvas.height);
            
        } else {
            gl.useProgram(this.displayProgram.program);
            this.obstacleManager.bindUniforms(gl, this.displayProgram.uniforms, SIM_WIDTH, SIM_HEIGHT);
            gl.activeTexture(gl.TEXTURE0); 
            gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture);
            gl.uniform1i(this.displayProgram.uniforms.uVelocity, 0);
        }
        
        gl.bindVertexArray(this.vao); 
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); 
        gl.bindVertexArray(null);
    }
}


