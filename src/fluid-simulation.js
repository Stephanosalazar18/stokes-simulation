/**
 * SIMULADOR DE FLUIDOS BASADO EN EL TEOREMA DE STOKES
 * ===================================================
 *
 * La presente clase orquesta el pipeline de integrales que resuelve la
 * version 2D de la ecuacion de Navier-Stokes incompresible:
 *
 *     ∂v/∂t + (v·∇)v = -∇p/ρ + ν∇²v
 *
 * La clave matematica que conecta el codigo con el Teorema de Stokes es
 * la DESCOMPOSICION DE HELMHOLTZ-HODGE: cualquier campo puede escribirse
 * como v = v_libre + ∇p, donde v_libre tiene divergencia nula.
 *
 * TEOREMA DE STOKES:
 *     ∮_C v · dr = ∬_S (∇ × v) · dS
 *
 * El paso de PROYECCION (v' = v - ∇p) preserva la integral de circulacion
 * porque ∮_C ∇p · dr = 0 para todo escalar p, luego
 *     ∮_C v · dr = ∮_C v' · dr
 * Solo removemos la componente irrotacional; la circulacion (= vorticidad
 * integrada en 2D) no se altera. Esto valida el pipeline numericamente.
 *
 * ETAPAS DE step() (orden matematico):
 *   1. splat    : inyecta momentum/densidad (input de circulacion)
 *   2. source   : inyecta viento y densidad en el inlet (Dirichlet)
 *   3. advection: integra ∂v/∂t + (v·∇)v = 0 (lineas de flujo)
 *   4. uvAdvect : (solo modo imagen) propaga la deformacion de UV
 *   5. jacobi   : resuelve ∇²p = ∇·v iterativamente (Poisson)
 *   6. projection: v' = v - ∇p (Stokes -> preserva circulacion)
 *
 * ESTADO HTML:
 *   windTunnelMode: inyecta viento continuo desde la izquierda
 *   imageMode: advecta un mapa UV en lugar del color para no difuminar
 */

import {
    baseVertexShader, advectionFragmentShader, jacobiFragmentShader,
    projectionFragmentShader, splatFragmentShader, displayFragmentShader, sourceFragmentShader,
    initUVFragmentShader, uvAdvectionFragmentShader, displayImageFragmentShader // SHADERS UV
} from './shaders.js';
import { compileShader, createProgram, createDoubleFBO } from './webgl-utils.js';
import { ObstacleManager } from './obstacle-manager.js';

/** Resolucion de la simulacion (texturas fisicas, no de pantalla). */
export const SIM_WIDTH = 512;
export const SIM_HEIGHT = 512;
/** Iteraciones del metodo de Jacobi para la ecuacion de Poisson ∇²p = ∇·v. */
const JACOBI_ITERATIONS = 20;

export class FluidSimulation {
    constructor(canvas) {
        this.canvas = canvas; // Referencia al canvas HTML donde se dibuja
        this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false }); // Contexto WebGL2 (sin canal alpha, sin antialiasing para mejor rendimiento)
        if (!this.gl) throw new Error('WebGL2 no soportado'); // WebGL2 es necesario para RGBA32F y texelFetch

        const gl = this.gl;
        gl.getExtension('EXT_color_buffer_float'); // Habilita render-to-texture con formato float (RGBA32F)
        gl.getExtension('OES_texture_float_linear'); // Permite filtrado LINEAR en texturas float (suavizado en la advection)
        gl.clearColor(0.0, 0.0, 0.0, 0); // Color de limpieza: negro transparente

        this.obstacleManager = new ObstacleManager(canvas); // Maneja los obstaculos solidos y sus uniformes
        
        this.windTunnelMode = true; // Modo inicial: viento continuo desde la izquierda (Dirichlet inlet)
        this.imageMode = false;     // Modo inicial: sin imagen (solo humo/pintura)
        this.currentImageElement = null; // Referencia al elemento <img> cargado por el usuario
        this.imageTexture = null;        // Textura WebGL con la imagen original intacta
        
        this.inletVelocity = 5.0;    // Velocidad del viento en el inlet [1..15]
        this.inletSize = 0.050;       // Fraccion vertical del inlet (ancho del chorro)
        this.smokeDecay = 0.999;      // Factor de evaporacion del humo por frame (multiplicativo)
        this.splatForce = 400;        // Intensidad del pincelazo del mouse
        this.splatRadius = 0.0015;    // Ancho gaussiano del pincel del mouse

        this.mouse = { x: 0, y: 0, prevX: 0, prevY: 0, dx: 0, dy: 0, down: false, moved: false }; // Estado del mouse (coords normalizadas 0..1)
        this.dt = 1.0; // Paso de tiempo (adimensional: 1 frame = 1 unidad)
        this.dx = 1.0; // Espaciado de la grilla (adimensional por ahora)

        this.initShaders(); // Compila y linkea todos los programas shader
        this.initBuffers(); // Crea el VAO del quad que cubre toda la pantalla
        this.initFBOs();    // Crea los FBOs dobles para ping-pong (velocidad y UV)
        this.initEvents();  // Registra los eventos de mouse
    }

    /** Compila y guarda los programas shader que se usaran en el pipeline. */
    initShaders() {
        const gl = this.gl;
        const vs = compileShader(gl, gl.VERTEX_SHADER, baseVertexShader); // Vertex shader compartido
        
        this.advectionProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, advectionFragmentShader)); // Paso 3: transporta la velocidad
        this.jacobiProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, jacobiFragmentShader)); // Paso 5: resuelve Poisson
        this.projectionProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, projectionFragmentShader)); // Paso 6: aplica Helmholtz-Hodge
        this.splatProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, splatFragmentShader)); // Paso 1: inyeccion de momentum/densidad
        this.displayProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, displayFragmentShader)); // Render humo/pintura
        this.sourceProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, sourceFragmentShader)); // Paso 2: inyector de viento Dirichlet
        
        // Programas de Coordenadas (solo modo imagen)
        this.initUVProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, initUVFragmentShader)); // Inicializa el UVMap a vUv
        this.uvAdvectionProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, uvAdvectionFragmentShader)); // Paso 4: advecta el UVMap
        this.displayImageProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, displayImageFragmentShader)); // Render de imagen deformada
    }

    /** Crea el quad de pantalla (-1..1) que usan todos los fragment shaders. */
    initBuffers() {
        const gl = this.gl;
        this.vao = gl.createVertexArray(); // Vertex Array Object que guarda el estado del atributo
        gl.bindVertexArray(this.vao);
        const buffer = gl.createBuffer(); // VBO con 4 vertices (TRIANGLE_STRIP)
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW); // Quad cubriendo clip-space
        gl.enableVertexAttribArray(0); // Position en location 0
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); // 2 floats por vertice, sin stride
        gl.bindVertexArray(null);
    }

    /** Crea los FBOs dobles (ping-pong) para la velocidad y el mapa UV. */
    initFBOs() {
        this.velocityFBO = createDoubleFBO(this.gl, SIM_WIDTH, SIM_HEIGHT); // RGBA32F: (u, v, p, densidad)
        this.uvFBO = createDoubleFBO(this.gl, SIM_WIDTH, SIM_HEIGHT); // RGBA: (uvX, uvY, *, *) - deformacion del muestreo
    }

    /** Reinicia el UVMap al estado inicial (vUv sin deformacion). */
    resetUVs() {
        const gl = this.gl;
        gl.useProgram(this.initUVProgram.program); // Shader que escribe vUv en cada texel
        this.blit(this.uvFBO.read);  // Limpia read
        this.blit(this.uvFBO.write); // Limpia write
    }

    /** Carga (o reemplaza) la imagen del usuario y activa el modo imagen. */
    setImage(imageElement) {
        this.currentImageElement = imageElement; // Guarda el <img> para consultar width/height
        const gl = this.gl;
        
        if (this.imageTexture) gl.deleteTexture(this.imageTexture); // Libera la textura anterior si existia
        this.imageTexture = gl.createTexture(); // Nueva textura para la imagen original
        gl.bindTexture(gl.TEXTURE_2D, this.imageTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); // Filtro LINEAR (suave al muestrear)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); // No repetir fuera de [0,1]
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageElement); // Sube la imagen a la GPU

        this.imageMode = true;
        this.clearFluid(); // Borra velocidad y restaura el mapa UV al estado inicial intacto
    }

    /** Limpia la velocidad y (si aplica) el mapa UV. */
    clearFluid() {
        const gl = this.gl;
        // Borra ambos FBOs de velocidad a cero (negro transparente)
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO.read.fbo);
        gl.clearColor(0.0, 0.0, 0.0, 0.0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.velocityFBO.write.fbo);
        gl.clearColor(0.0, 0.0, 0.0, 0.0); gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        if (this.imageMode) {
            this.resetUVs(); // Reinicia la imagen a cero deformacion
        }
    }

    /** Registra los eventos del mouse para el pincel del usuario. */
    initEvents() {
        this.canvas.addEventListener('mousedown', (e) => {
            this.mouse.down = true; // Comienza el arrastre
            this.updatePointerCoords(e.clientX, e.clientY, true); // Inicializa coords SIN dx/dy explosivo
        });
        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.mouse.down) return; // Ignora movimientos sin boton presionado
            this.updatePointerCoords(e.clientX, e.clientY, false); // Calcula dx/dy real
        });
        window.addEventListener('mouseup', () => { this.mouse.down = false; }); // Termina el arrastre
    }

    /**
     * Actualiza las coordenadas del mouse (normalizadas 0..1) y el delta.
     * isDown=true: inicializa prevX/prevY para que dx/dy empiecen en 0.
     * isDown=false: calcula dx=x-prevX, dy=y-prevY (movimiento real).
     */
    updatePointerCoords(clientX, clientY, isDown) {
        const rect = this.canvas.getBoundingClientRect(); // Rect del canvas en pantalla
        this.mouse.x = (clientX - rect.left) / rect.width; // Normaliza X a [0,1]
        this.mouse.y = 1.0 - (clientY - rect.top) / rect.height; // Y invertida (WebGL = abajo-arriba)
        if (isDown) {
            this.mouse.prevX = this.mouse.x; this.mouse.prevY = this.mouse.y; // Fija el origen
            this.mouse.dx = 0; this.mouse.dy = 0; // Sin delta inicial
        } else {
            this.mouse.dx = this.mouse.x - this.mouse.prevX; // Delta X desde el ultimo frame
            this.mouse.dy = this.mouse.y - this.mouse.prevY; // Delta Y
            this.mouse.prevX = this.mouse.x; this.mouse.prevY = this.mouse.y; // Actualiza prev
        }
        this.mouse.moved = Math.abs(this.mouse.dx) > 0 || Math.abs(this.mouse.dy) > 0; // Flag de movimiento
    }

    /**
     * Dibuja el quad de pantalla sobre el FBO objetivo (o el canvas por defecto).
     * Equivalente a "lanzar" el fragment shader actual sobre todos los texeles.
     */
    blit(target) {
        const gl = this.gl;
        if (target) { gl.viewport(0, 0, target.width, target.height); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); } // Render a FBO (sim resolution)
        else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); } // Render al canvas (pantalla)
        gl.bindVertexArray(this.vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null); // Dibuja el quad
    }

    /**
     * SPLAT - Inyecta una pincelada gaussiana de momentum y densidad en (x, y).
     * Stokes: introduce circulacion/vorticidad localizada que el solver luego redistribuira.
     */
    splat(x, y, dx, dy) {
        const gl = this.gl;
        gl.useProgram(this.splatProgram.program);
        gl.uniform1i(this.splatProgram.uniforms.uTarget, 0); // Textura de entrada en slot 0
        gl.uniform1f(this.splatProgram.uniforms.uAspectRatio, this.canvas.width / this.canvas.height); // Corrige elStretch horizontal
        gl.uniform2f(this.splatProgram.uniforms.uPoint, x, y); // Centro del pincel (coords normalizadas)
        
        // Si estamos en modo imagen, inyectamos VELOCIDAD pero NADA de humo blanco (0.0)
        const paintDensity = this.imageMode ? 0.0 : 1.0; // En modo imagen el humo no se ve
        gl.uniform4f(this.splatProgram.uniforms.uColor, dx * this.splatForce, dy * this.splatForce, 0.0, paintDensity); // (velX, velY, presion, densidad)
        
        gl.uniform1f(this.splatProgram.uniforms.uRadius, this.splatRadius); // Ancho del gaussiano
        gl.activeTexture(gl.TEXTURE0); // Activa unidad de textura 0
        gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture); // Lee del FBO de velocidad actual
        this.blit(this.velocityFBO.write); // Escribe en el FBO complementario
        this.velocityFBO.swap(); // Swap ping-pong: write pasa a ser read para el siguiente paso
    }

    /**
     * AVANCE DE LA SIMULACION - Ejecuta un paso completo del pipeline de Stokes.
     *
     * Orden matematico del pipeline (cada uno resuelve una parte de la integral):
     *   1. splat:    inyecta momentum (genera circulacion localmente)
     *   2. source:   inyecta viento Dirichlet izq (genera flujo de entrada)
     *   3. advection: integra (v·∇)v backward (semi-Lagrangiano)
     *   4. uvAdvect: (modo imagen) integra la deformacion del UVMap
     *   5. jacobi:   resuelve ∇²p = ∇·v (corrector de divergencia)
     *   6. projection: v' = v - ∇p (preserva ∮_C v·dr - Stokes)
     *
     * El resultado de cada paso se guarda en velocityFBO.write y se swapea.
     * iteration count es JACOBI_ITERATIONS para convergencia del Poisson.
     */
    step() {
        const gl = this.gl;

        // --- Paso 1: SPLAT (input de circulacion local) ---
        // Solo inyecta momentum con el mouse si NO estamos arrastrando un obstaculo
        if (this.mouse.down && this.mouse.moved && !this.obstacleManager.isDragging) {
            this.splat(this.mouse.x, this.mouse.y, this.mouse.dx, this.mouse.dy);
            this.mouse.moved = false; // Resetea para no re-inyectar en cada frame estatico
        }

        // --- Paso 2: SOURCE (viento Dirichlet en el inlet izquierdo) ---
        if (this.windTunnelMode) {
            gl.useProgram(this.sourceProgram.program);
            gl.uniform1i(this.sourceProgram.uniforms.uTarget, 0); // Textura de entrada
            if (this.sourceProgram.uniforms.uInletVelocity) gl.uniform1f(this.sourceProgram.uniforms.uInletVelocity, this.inletVelocity); // Velocidad del chorro
            if (this.sourceProgram.uniforms.uInletSize) gl.uniform1f(this.sourceProgram.uniforms.uInletSize, this.inletSize); // Ancho vertical
            
            // Si el tunel esta encendido en modo imagen, no inyecta humo blanco
            if (this.sourceProgram.uniforms.uInjectDensity !== undefined) {
                gl.uniform1f(this.sourceProgram.uniforms.uInjectDensity, this.imageMode ? 0.0 : 1.0); // 0 en modo imagen, 1 en humo
            }

            gl.activeTexture(gl.TEXTURE0); 
            gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture); // Lee velocidad actual
            this.blit(this.velocityFBO.write); // Aplica el inyector
            this.velocityFBO.swap(); // Swap
        }

        // --- Paso 3: ADVECCION (integra (v·grad)v backward) ---
        gl.useProgram(this.advectionProgram.program);
        this.obstacleManager.bindUniforms(gl, this.advectionProgram.uniforms, SIM_WIDTH, SIM_HEIGHT); // Inyecta obstaculos y uResolution
        gl.uniform1f(this.advectionProgram.uniforms.uDt, this.dt); // Paso de tiempo
        if (this.advectionProgram.uniforms.uDecay) gl.uniform1f(this.advectionProgram.uniforms.uDecay, this.smokeDecay); // Evaporacion del humo
        if (this.advectionProgram.uniforms.uWindTunnel !== undefined) gl.uniform1i(this.advectionProgram.uniforms.uWindTunnel, this.windTunnelMode ? 1 : 0); // Activa inlet condition
        if (this.advectionProgram.uniforms.uInletSize) gl.uniform1f(this.advectionProgram.uniforms.uInletSize, this.inletSize); // Ancho del inlet
        gl.activeTexture(gl.TEXTURE0); 
        gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture); // Lee velocidad actual
        gl.uniform1i(this.advectionProgram.uniforms.uVelocity, 0); // Slot 0 = uVelocity
        this.blit(this.velocityFBO.write); // Advecta hacia el FBO write
        this.velocityFBO.swap(); // Swap

        // --- Paso 4 (solo modo imagen): ADVECCION DEL MAPA UV ---
        // DEFORMACION PROGRESIVA: Advectamos las Coordenadas UV en lugar del Color
        if (this.imageMode) {
            gl.useProgram(this.uvAdvectionProgram.program);
            gl.uniform2f(this.uvAdvectionProgram.uniforms.uResolution, SIM_WIDTH, SIM_HEIGHT); // Resolucion para normalizar la velocidad
            gl.uniform1f(this.uvAdvectionProgram.uniforms.uDt, this.dt); // Paso de tiempo
            
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture); // Campo de velocidad (recien actualizado)
            gl.uniform1i(this.uvAdvectionProgram.uniforms.uVelocity, 0); // Slot 0
            
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.uvFBO.read.texture); // UVMap actual
            gl.uniform1i(this.uvAdvectionProgram.uniforms.uUVMap, 1); // Slot 1
            
            this.blit(this.uvFBO.write); // Deforma el UVMap
            this.uvFBO.swap(); // Swap
        }

        // --- Paso 5: JACOBI (resuelve ∇²p = ∇·v iterativamente) ---
        gl.useProgram(this.jacobiProgram.program);
        this.obstacleManager.bindUniforms(gl, this.jacobiProgram.uniforms, SIM_WIDTH, SIM_HEIGHT); // Inyecta obstaculos (Neumann en solidos)
        gl.uniform1f(this.jacobiProgram.uniforms.uDx, this.dx); // Espaciado de grilla
        for (let i = 0; i < JACOBI_ITERATIONS; i++) { // 20 iteraciones para converge del Poisson
            gl.activeTexture(gl.TEXTURE0); 
            gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture); // Lee el p actual
            gl.uniform1i(this.jacobiProgram.uniforms.uVelocity, 0); // Slot 0
            this.blit(this.velocityFBO.write); // Actualiza p
            this.velocityFBO.swap(); // Swap
        }

        // --- Paso 6: PROYECCION (v' = v - ∇p, preserva ∮_C v·dr por Stokes) ---
        gl.useProgram(this.projectionProgram.program);
        this.obstacleManager.bindUniforms(gl, this.projectionProgram.uniforms, SIM_WIDTH, SIM_HEIGHT); // Inyecta obstaculos
        gl.uniform1f(this.projectionProgram.uniforms.uDx, this.dx); // Espaciado de grilla
        gl.activeTexture(gl.TEXTURE0); 
        gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture); // Lee v con p resuelto
        gl.uniform1i(this.projectionProgram.uniforms.uVelocity, 0); // Slot 0
        this.blit(this.velocityFBO.write); // Calcula v' = v - ∇p
        this.velocityFBO.swap(); // Swap final del frame
    }

    /**
     * RENDERIZADO - Dibuja el estado actual segun el modo activo.
     *
     * - Modo humo/pintura: muestra la densidad (componente w) en escala de
     *   grises, masca los obstaculos. Visualiza directamente la vorticidad
     *   integrada por el flujo (Stokes).
     *
     * - Modo imagen: muestrea la textura ORIGINAL usando el UVMap deformado.
     *   De este modo la vorticidad generada se muestra como remolinos sin
     *   aplicar ningun suavizado gaussiano extra a la foto.
     */
    render() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Render directo al canvas (no a FBO)
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); // Resolucion real de pantalla
        gl.clear(gl.COLOR_BUFFER_BIT); // Limpia el frame anterior

        if (this.imageMode && this.imageTexture) {
            // --- Modo imagen: muestrea la textura original via el UVMap deformado ---
            gl.useProgram(this.displayImageProgram.program);
            this.obstacleManager.bindUniforms(gl, this.displayImageProgram.uniforms, SIM_WIDTH, SIM_HEIGHT); // Mascara de solidos
            
            gl.activeTexture(gl.TEXTURE0); 
            gl.bindTexture(gl.TEXTURE_2D, this.uvFBO.read.texture); // Pasamos el mapa deformado
            gl.uniform1i(this.displayImageProgram.uniforms.uUVMap, 0); // Slot 0
            
            gl.activeTexture(gl.TEXTURE1); 
            gl.bindTexture(gl.TEXTURE_2D, this.imageTexture); // Pasamos la foto original pura (sin tocar)
            gl.uniform1i(this.displayImageProgram.uniforms.uImage, 1); // Slot 1
            
            if(this.displayImageProgram.uniforms.uImageRes) gl.uniform2f(this.displayImageProgram.uniforms.uImageRes, this.currentImageElement.width, this.currentImageElement.height); // Resolucion de la imagen para object-fit cover
            if(this.displayImageProgram.uniforms.uSimRes) gl.uniform2f(this.displayImageProgram.uniforms.uSimRes, this.canvas.width, this.canvas.height); // Resolucion del canvas
            
        } else {
            // --- Modo humo/pintura: muestra densidad (componente w) en escala de grises ---
            gl.useProgram(this.displayProgram.program);
            this.obstacleManager.bindUniforms(gl, this.displayProgram.uniforms, SIM_WIDTH, SIM_HEIGHT); // Mascara de solidos
            gl.activeTexture(gl.TEXTURE0); 
            gl.bindTexture(gl.TEXTURE_2D, this.velocityFBO.read.texture); // Lee el campo de velocidad
            gl.uniform1i(this.displayProgram.uniforms.uVelocity, 0); // Slot 0
        }
        
        gl.bindVertexArray(this.vao); 
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); // Dibuja el quad de pantalla
        gl.bindVertexArray(null);
    }
}


