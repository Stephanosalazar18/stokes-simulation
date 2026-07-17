/**
 * SHADERS DE LA SIMULACION DE STOKES
 * ================================
 *
 * TEOREMA DE STOKES (forma clasica):
 *   ∮_C F · dr = ∬_S (∇ × F) · dS
 *
 * Donde:
 *   - F: campo vectorial (en nuestro caso, el campo de velocidad v = (u, w, p, densidad))
 *   - C: curva cerrada que delimita la superficie S
 *   - ∇ × F: rotacional (vorticidad en 2D: ω = ∂v/∂x - ∂u/∂y)
 *
 * CONEXION CON LA SIMULACION DE FLUIDOS:
 * El teorema de Stokes establece que la circulacion del campo alrededor de un
 recorrido cerrado es igual al flujo del rotacional a traves de la superficie
 que delimita. Para un fluido incompresible, imponemos ∇·v = 0.
 *
 * DESCOMPOSICION DE HELMHOLTZ-HODGE (consecuencia directa de Stokes):
 * Cualquier campo vectorial puede descomponerse como:
 *   v = v_libre_divergencia + ∇p
 *
 * Si integramos esta descomposicion en una curva cerrada C, por Stokes:
 *   ∮_C v · dr = ∮_C v_libre · dr + ∮_C ∇p · dr
 *
 * El termino de presion ∮_C ∇p · dr = 0 (el gradiente de un escalar produce
 * circulacion nula), por lo que:
 *   ∮_C v · dr = ∮_C v_libre · dr
 *
 * Es decir, proyectar (eliminar el gradiente de presion) PRESERVA la
 * circulacion del teorema de Stokes. Esta es la base matematica del
 * paso de Proyeccion en el solver.
 *
 * PIPELINE DE INTEGRALES POR PASO:
 *   1. Source: inyecta velocidad y densidad (condicion de frontera Dirichlet)
 *   2. Advection: integra ∂v/∂t + (v·∇)v = 0 (metodo semi-Lagrangiano)
 *   3. Jacobi: resuelve ∇²p = ∇·v (Poisson, iterativo) -> corrije divergencia
 *   4. Projection: v' = v - ∇p (anula la componente de gradiente)
 *
 * Cada uno de estos pasos se implementa en un shader de fragmento. La
 * documentacion en cada shader detalla la integral correspondiente.
 */

/**
 * VERTEX SHADER BASE
 * ==================
 * No involucra integrales; solo mapea el quad [-1,1]² al espacio de pantalla
 * y propaga vUv = aPosition*0.5 + 0.5 para uso de los fragment shaders.
 */
export const baseVertexShader = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

/**
 * LOGICA DE OBSTACULOS SOLIDOS (getSolid)
 * ========================================
 * Define la mascara solida que se reutiliza en todos los shaders fisicos.
 *
 * Conexion con Stokes: los obstaculos imponen una condicion de frontera
 * no-deslizamiento (no-slip):
 *   v|_obstaculo = 0
 *
 * Matematicamente, la curva cerrada C del teorema de Stokes puede
 * correrse ahora tanto por la frontera externa del dominio como por la
 * frontera de los obstaculos solidos. En ambos casos:
 *   ∮_C v · dr = 0 (sobre el solido) ya que v = 0 ahi.
 *
 * Esto garantiza que la vorticidad (rotacional) generada por el obstaculo
 * sea consistente y conservativa con el flujo libre.
 */
const obstacleLogic = `
uniform vec2 uObstaclePos[10];
uniform float uObstacleSize[10];
uniform int uObstacleType[10];
uniform int uObstacleCount;
uniform float uAspectRatio;

float getSolid(vec2 uv) {
    for (int i = 0; i < 10; i++) {
        if (i >= uObstacleCount) break;
        if (uObstacleType[i] == 0) continue;
        
        vec2 p = uv; p.x *= uAspectRatio;
        vec2 c = uObstaclePos[i]; c.x *= uAspectRatio;
        
        if (uObstacleType[i] == 1) { 
            if (length(p - c) < uObstacleSize[i]) return 0.0; 
        } else if (uObstacleType[i] == 2) { 
            vec2 d = abs(p - c);
            if (max(d.x, d.y) < uObstacleSize[i]) return 0.0;
        }
    }
    return 1.0;
}
`;

/**
 * ADVECCION - Ecuacion de transporte integral
 * ===========================================
 * Ecuacion: ∂v/∂t + (v·∇)v = 0
 *
 * Forma integral (metodo semi-Lagrangiano):
 *   v(x, t+dt) = v(x - v(x,t)·dt, t)
 *
 * En lugar de discretizar el operador diferencial ∇, integramos backward
 * la trayectoria de la particula: tomamos la velocidad en el punto donde
 * DEBIERA venir el fluido y la arrastramos. Esto equivale a integrar a lo
 * largo de la linea de flujo.
 *
 * CAMPOS DEL OUTPUT RGBA:
 *   x, y  = velocidad (u, v)
 *   z     = presion (p)
 *   w     = densidad del humo (Mantiene el valor "c" de Stokes)
 *
 * Disipacion: a.xy *= 0.999 (friccion) y a.w *= uDecay (humo se evapora)
 *
 * Condiciones de borde (reflexion sin deslizamiento):
 * Implementan ∮_C v·dr = 0 sobre los bordes del dominio.
 * En el inlet del tunel de viento, se reemplaza por x > 0 (flujo entrante).
 */
export const advectionFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
uniform vec2 uResolution;
uniform float uDt;
uniform float uDecay;
uniform int uWindTunnel; 
uniform float uInletSize;
${obstacleLogic}
in vec2 vUv;
out vec4 fragColor;

void main() {
    if (getSolid(vUv) < 0.5) { fragColor = vec4(0.0); return; }

    ivec2 fc = ivec2(gl_FragCoord.xy);
    vec4 o = texelFetch(uVelocity, fc, 0);
    vec4 n = texelFetch(uVelocity, fc + ivec2(0, 1), 0);
    vec4 e = texelFetch(uVelocity, fc + ivec2(1, 0), 0);
    vec4 s = texelFetch(uVelocity, fc + ivec2(0, -1), 0);
    vec4 w = texelFetch(uVelocity, fc + ivec2(-1, 0), 0);

    vec4 a = texture(uVelocity, (gl_FragCoord.xy - o.xy * uDt) / uResolution);
    
    a.xy *= 0.999; 
    a.w  *= uDecay;  

    fragColor = a;

    bool isInlet = (uWindTunnel == 1) && (abs(vUv.y - 0.5) < uInletSize);

    if (fc.x == 0 && !isInlet) fragColor = vec4(-e.xy, e.z, 0.0);
    if (fc.y == 0) fragColor = vec4(-n.xy, n.z, 0.0);
    if (fc.x == int(uResolution.x) - 1) fragColor = vec4(-w.xy, w.z, 0.0);
    if (fc.y == int(uResolution.y) - 1) fragColor = vec4(-s.xy, s.z, 0.0);
}`;

/**
 * SOURCE - Inyector de viento / fuente de momentum
 * ================================================
 * No resuelve una integral por si mismo: impone una CONDICION DE FRONTERA
 * tipo Dirichlet sobre el borde izquierdo del dominio:
 *   v(input) = (uInletVelocity, 0), densidad = uInjectDensity
 *
 * Conexion con Stokes: al introducir un termino de flujo a traves de C
 * (inlet), generamos circulacion alrededor de cualquier curva cerrada
 * que rodee el inlet. El solver luego la redistribuye via adveccion
 * y proyeccion para satisfacer ∮_C v·dr = ∬_S (∇×v)·dS.
 */
export const sourceFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uTarget;
uniform float uInletVelocity;
uniform float uInletSize;
uniform float uInjectDensity; 
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4 base = texture(uTarget, vUv);
    if (vUv.x < 0.03 && abs(vUv.y - 0.5) < uInletSize) {
        base.xy = vec2(uInletVelocity, 0.0); 
        base.w = uInjectDensity; 
    }
    fragColor = base;
}`;

/**
 * JACOBI - Resolucion iterativa de Poisson: ∇²p = ∇·v
 * ====================================================
 * NUCLEO DEL TEOREMA DE STOKES:
 * Para que el fluido sea incompresible (∇·v = 0), necesitamos encontrar
 * la presion p tal que su laplaciano compense la divergencia del campo:
 *   ∇²p = ∇·v
 *
 * Aproximacion por diferencias finitas del laplaciano:
 *   ∇²p = (pN + pE + pS + pW - 4·po) / dx²
 *
 * Iteracion de Jacobi:
 *   p_new = po + (div - Σvecinos·a) / (-4·a)   con a = 1/dx²
 *
 * DIVERGENCIA (producto escalar del gradiente):
 *   div = (e.x - w.x + n.y - s.y) / (2·dx²) ≈ ∂u/∂x + ∂v/∂y
 *
 * IMPORTANTE: La divergencia NO es parte directa del teorema de Stokes
 * (Stokes usa el ROTACIONAL, no la divergencia). Sin embargo, el solver
 * aca la usa como ecuacion de correccion. La vorticidad (rotacional)
 * emerge INDIRECTAMENTE cuando estas presiones producen gradientes que
 * desvian el flujo alrededor de los obstaculos.
 *
 * Tratamiento de obstaculos: si un vecino es solido (getSolid < 0.5),
 * se reemplaza su presion por la presion del centro (Neumann boundary),
 * lo que equivale a imposar ∂p/∂n = 0 (condicion de frontera natural).
 */
export const jacobiFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
uniform float uDx;
uniform vec2 uResolution;
${obstacleLogic}
in vec2 vUv;
out vec4 fragColor;

void main() {
    if (getSolid(vUv) < 0.5) { fragColor = vec4(0.0); return; }

    ivec2 fc = ivec2(gl_FragCoord.xy);
    vec4 o = texelFetch(uVelocity, fc, 0);
    vec4 n = texelFetch(uVelocity, fc + ivec2(0, 1), 0);
    vec4 e = texelFetch(uVelocity, fc + ivec2(1, 0), 0);
    vec4 s = texelFetch(uVelocity, fc + ivec2(0, -1), 0);
    vec4 w = texelFetch(uVelocity, fc + ivec2(-1, 0), 0);

    vec2 px = 1.0 / uResolution;
    float pN = getSolid(vUv + vec2(0.0, px.y)) < 0.5 ? o.z : n.z;
    float pS = getSolid(vUv - vec2(0.0, px.y)) < 0.5 ? o.z : s.z;
    float pE = getSolid(vUv + vec2(px.x, 0.0)) < 0.5 ? o.z : e.z;
    float pW = getSolid(vUv - vec2(px.x, 0.0)) < 0.5 ? o.z : w.z;

    float div = (e.x - w.x + n.y - s.y) / (2.0 * uDx * uDx);
    float a = 1.0 / (uDx * uDx);
    float newP = 1.0 / (-4.0 * a) * (div - a * (pN + pE + pS + pW));

    fragColor = vec4(o.xy, newP, o.w);
}`;

/**
 * PROYECCION - Helmholtz-Hodge: v' = v - ∇p
 * ===========================================
 * PASO MAS DIRECTAMENTE LIGADO AL TEOREMA DE STOKES.
 *
 * Despues de resolver p en Jacobi, restamos su gradiente:
 *   v' = v - ∇p
 *
 * El resultado satisface ∇·v' = 0 (incompresibilidad).
 *
 * Interpretaion via Stokes: dado que el gradiente de un escalar tiene
 * circulacion nula sobre cualquier curva cerrada C:
 *   ∮_C ∇p · dr = 0
 *
 * Resulta directamente que:
 *   ∮_C v · dr = ∮_C v' · dr
 *
 * La proyeccion PRESERVA la integral de circulacion del teorema de Stokes.
 * Solo remueve la "parte irrotacional" (componente de gradiente), dejando
 * intacta la circulacion asociada al rotacional del campo.
 *
 * Gradiente (diferencias finitas usando presion en los vecinos solidos):
 *   ∇p = ((pE - pW)/(2·dx²), (pN - pS)/(2·dx²))
 *
 * Manejo de vecinos solidos: si un vecino es solido, se usa la presion
 * central en su lugar, imponiendo implicitamente la condicion de borde
 * no-flujo a traves del solido (∇p normal al solido = 0).
 */
export const projectionFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
uniform float uDx;
uniform vec2 uResolution;
${obstacleLogic}
in vec2 vUv;
out vec4 fragColor;

void main() {
    if (getSolid(vUv) < 0.5) { fragColor = vec4(0.0); return; }

    ivec2 fc = ivec2(gl_FragCoord.xy);
    vec4 o = texelFetch(uVelocity, fc, 0);
    vec4 n = texelFetch(uVelocity, fc + ivec2(0, 1), 0);
    vec4 e = texelFetch(uVelocity, fc + ivec2(1, 0), 0);
    vec4 s = texelFetch(uVelocity, fc + ivec2(0, -1), 0);
    vec4 w = texelFetch(uVelocity, fc + ivec2(-1, 0), 0);

    vec2 px = 1.0 / uResolution;
    float pN = getSolid(vUv + vec2(0.0, px.y)) < 0.5 ? o.z : n.z;
    float pS = getSolid(vUv - vec2(0.0, px.y)) < 0.5 ? o.z : s.z;
    float pE = getSolid(vUv + vec2(px.x, 0.0)) < 0.5 ? o.z : e.z;
    float pW = getSolid(vUv - vec2(px.x, 0.0)) < 0.5 ? o.z : w.z;

    vec2 grad = vec2(pE - pW, pN - pS) / (2.0 * uDx * uDx);
    fragColor = vec4(o.xy - grad, o.zw);
}`;

/**
 * SPLAT - Inyeccion localizada de momentum y densidad
 * ===================================================
 * Agrega una "pincelada" gaussiana al campo de velocidad y densidad.
 *
 * En terminos de Stokes, esto introduce una Schwelle de circulacion/
 * vorticidad localizada en torno al punto (x, y), similar a como se
 * introduce un remolino en el fluido. El subsiguiente paso de Jacobi
 * redistribuye esta circulacion para que cumpla la restriccion de
 * incompresibilidad.
 *
 * Formula:
 *   splat = exp(-(aspecto * |p - punto|²) / radio) * color
 *   output = base + splat
 *
 * No depende de Stokes directamente: solo agrega un termino fuente
 * que despues sera proyectado y advectado siguiendo el pipeline.
 */
export const splatFragmentShader = `#version 300 es
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

/**
 * DISPLAY - Render del campo de velocidad (modo humo / pintura)
 * ============================================================
 * No involucra integrales; solo muestra la componente w (densidad
 * del humo) como escala de grises y aplica la mascara de obstaculos
 * en el color gris (0.15) para distinguir el solido del fluido.
 *
 * En modo "imagen", NO usamos este shader: usamos displayImageFragmentShader
 * que mapea la imagen original a traves de un campo UV deformado.
 */
export const displayFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
${obstacleLogic}
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec4 c = texture(uVelocity, vUv);
    vec4 fluidColor = vec4(vec3(c.w), 1.0);       
    vec4 obsColor = vec4(0.15, 0.15, 0.15, 1.0);  
    
    float mask = 1.0; 
    for (int i = 0; i < 10; i++) {
        if (i >= uObstacleCount) break;
        if (uObstacleType[i] == 0) continue;
        vec2 p = vUv; p.x *= uAspectRatio;
        vec2 center = uObstaclePos[i]; center.x *= uAspectRatio;
        float visualSize = uObstacleSize[i] + 0.003; 
        float d = 1.0;
        if (uObstacleType[i] == 1) d = length(p - center) - visualSize;
        else if (uObstacleType[i] == 2) { vec2 distVec = abs(p - center); d = max(distVec.x, distVec.y) - visualSize; }
        float aa = smoothstep(-0.002, 0.002, d);
        mask = min(mask, aa);
    }
    fragColor = mix(obsColor, fluidColor, mask);
}`;

/**
 * MAGIA ANTI-DIFUMINADO: MAPA UV DEFORMABLE
 * ==========================================
 * En lugar de advectar y difuminar los colores de la imagen, deformamos
 * PERMANENTEMENTE las coordenadas UV de cada texel. La textura original
 * queda INTACTA (cero suavizado gaussiano) y solo se muestrea usando
 * coordenadas cada vez mas arremolinadas.
 *
 * En terminos de Stokes, la vorticidad (∇ × v) generada por el cursor
 * queda registrada en el desplazamiento del mapa UV, y como leemos via
 * texture() con LINEAR, se preserva la nitidez. La energia del rotacional
 * de Stokes se traduce visualmente en el arremolinado del mapeo.
 *
 * initUV: almacena vUv en cada texel (estado inicial sin deformacion). */
export const initUVFragmentShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
    // Almacenamos las coordenadas exactas de pantalla
    fragColor = vec4(vUv, 0.0, 1.0);
}`;

/**
 * UV ADVECCION - Integra la trayectoria del mapa de coordenadas
 * =============================================================
 * v.map(x, t+dt) = v.map(x - v(x,t)·dt, t)
 *
 * Cada texel del UVMap se mueve hacia atras siguiendo el campo de
 * velocidad del fluido. La integracion es la MISMA forma semi-Lagrangiana
 * del advectionFragmentShader: integramos la "linea de flujo" pero sobre
 * el campo UV, no sobre el color. Asi se propaga la deformacion (vorticidad)
 * sin aplicar suavizado a la imagen original.
 */
export const uvAdvectionFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uVelocity;
uniform sampler2D uUVMap;
uniform vec2 uResolution;
uniform float uDt;
in vec2 vUv;
out vec4 fragColor;
void main() {
    vec2 vel = texture(uVelocity, vUv).xy;
    vec2 prevUv = vUv - (vel * uDt) / uResolution;
    // En lugar de mover la imagen, deformamos permanentemente las coordenadas
    fragColor = texture(uUVMap, prevUv); 
}`;

/**
 * DISPLAY IMAGE - Render usando el mapa UV deformado
 * ==================================================
 * Muestrea la imagen ORIGINAL (sin tocar) usando las coordenadas del
 * uvFBO (deformadas por la adveccion). Aplica object-fit "cover" para
 * preservar el aspect ratio, y mezcla con el color de obstaculos.
 *
 * La vorticidad / integral de Stokes se manifiesta en el doblez
 * espacial del muestreo de la imagen, dejando ver remolinos nitidos.
 */
export const displayImageFragmentShader = `#version 300 es
precision highp float;
uniform sampler2D uUVMap;
uniform sampler2D uImage;
uniform vec2 uImageRes;
uniform vec2 uSimRes;
${obstacleLogic}
in vec2 vUv;
out vec4 fragColor;

void main() {
    // 1. Leemos las coordenadas deformadas (vórtices puros)
    vec2 advectedUv = texture(uUVMap, vUv).xy;
    
    // 2. Mapeamos a Object-Fit Cover
    vec2 ratio = uSimRes / uImageRes;
    float scale = max(ratio.x, ratio.y);
    vec2 coverUv = (advectedUv - 0.5) * (ratio / scale) + 0.5;
    
    // 3. Leemos la foto original INTACTA usando las coordenadas arremolinadas (CERO difuminado gaussiano)
    vec4 imgColor = texture(uImage, vec2(coverUv.x, 1.0 - coverUv.y));
    
    // Obstáculos sólidos si el usuario los añade
    vec4 obsColor = vec4(0.15, 0.15, 0.15, 1.0); 
    float mask = 1.0; 
    for (int i = 0; i < 10; i++) {
        if (i >= uObstacleCount) break;
        if (uObstacleType[i] == 0) continue;
        vec2 p = vUv; p.x *= uAspectRatio;
        vec2 center = uObstaclePos[i]; center.x *= uAspectRatio;
        float visualSize = uObstacleSize[i] + 0.003; 
        float d = 1.0;
        if (uObstacleType[i] == 1) d = length(p - center) - visualSize;
        else if (uObstacleType[i] == 2) { vec2 distVec = abs(p - center); d = max(distVec.x, distVec.y) - visualSize; }
        mask = min(mask, smoothstep(-0.002, 0.002, d));
    }
    fragColor = mix(obsColor, imgColor, mask);
}`;