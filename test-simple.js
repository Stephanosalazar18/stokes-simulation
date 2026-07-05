// Test simple para verificar la lógica del simulador
import { readFileSync } from 'fs';

const code = readFileSync('./src/main.js', 'utf-8');

console.log('=== Análisis del código ===');
console.log('Tamaño:', code.length, 'bytes');
console.log('Tiene WebGL2:', code.includes('webgl2'));
console.log('Tiene EXT_color_buffer_float:', code.includes('EXT_color_buffer_float'));
console.log('Tiene advectionFragmentShader:', code.includes('advectionFragmentShader'));
console.log('Tiene displayFragmentShader:', code.includes('displayFragmentShader'));
console.log('Tiene initVelocity:', code.includes('initVelocity'));
console.log('Tiene requestAnimationFrame:', code.includes('requestAnimationFrame'));

// Verificar que los shaders tienen la estructura correcta
const advectionMatch = code.match(/const advectionFragmentShader = `([^`]+)`/);
if (advectionMatch) {
    console.log('\n=== Advection Shader ===');
    console.log('Tiene texelFetch:', advectionMatch[1].includes('texelFetch'));
    console.log('Tiene texture:', advectionMatch[1].includes('texture'));
    console.log('Tiene gl_FragCoord:', advectionMatch[1].includes('gl_FragCoord'));
    console.log('Tiene uMouse:', advectionMatch[1].includes('uMouse'));
}

const displayMatch = code.match(/const displayFragmentShader = `([^`]+)`/);
if (displayMatch) {
    console.log('\n=== Display Shader ===');
    console.log('Contenido:', displayMatch[1].trim());
}

console.log('\n=== Verificación de encoding del mouse ===');
console.log('Usa Math.abs para mouseZ:', code.includes('Math.abs(this.mouse.prevX)'));
console.log('Usa signo negativo cuando no presionado:', code.includes('-Math.abs'));

console.log('\n✅ Análisis completado');
