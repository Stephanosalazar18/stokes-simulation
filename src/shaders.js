export const baseVertexShader = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

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

// --- MAGIA ANTI-DIFUMINADO: SHADERS DE COORDENADAS ---

export const initUVFragmentShader = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
void main() {
    // Almacenamos las coordenadas exactas de pantalla
    fragColor = vec4(vUv, 0.0, 1.0);
}`;

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