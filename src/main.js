import { FluidSimulation } from './fluid-simulation.js';

const canvas = document.getElementById('canvas');
const sim = new FluidSimulation(canvas);

function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
}

window.addEventListener('resize', resize);
resize();

// --- CONTROLES DE LA INTERFAZ ---

const btnTunnel = document.getElementById('btn-tunnel');
const btnPaint = document.getElementById('btn-paint');
const btnImage = document.getElementById('btn-image');
const groupTunnelCtrls = document.getElementById('group-tunnel-controls');

// --- LÓGICA DE CARGA DE IMAGEN ---
let currentUploadedImage = null;
const fileUpload = document.getElementById('file-upload');
const btnUpload = document.getElementById('btn-upload');

btnUpload.addEventListener('click', () => fileUpload.click());

fileUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            currentUploadedImage = img;
            if (!sim.imageMode) {
                btnImage.click(); 
            } else {
                sim.setImage(img);
            }
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

function updateUIValues() {
    document.getElementById('sld-wind').value = sim.inletVelocity;
    document.getElementById('val-wind').textContent = sim.inletVelocity.toFixed(1);
    document.getElementById('sld-inlet-size').value = sim.inletSize;
    document.getElementById('val-inlet-size').textContent = sim.inletSize.toFixed(3);
    document.getElementById('sld-decay').value = sim.smokeDecay;
    document.getElementById('val-decay').textContent = sim.smokeDecay.toFixed(3);
}

// --- CAMBIO DE MODOS ---

btnTunnel.addEventListener('click', () => {
    sim.windTunnelMode = true;
    sim.imageMode = false;
    
    btnTunnel.classList.add('active');
    btnPaint.classList.remove('active');
    btnImage.classList.remove('active');
    
    sim.inletVelocity = 5.0;
    sim.inletSize = 0.050;
    sim.smokeDecay = 0.999; 
    updateUIValues();

    groupTunnelCtrls.style.opacity = '1';
    groupTunnelCtrls.style.pointerEvents = 'auto';

    if (sim.obstacleManager.obstacles.length === 0) sim.obstacleManager.addObstacle(1); 
});

btnPaint.addEventListener('click', () => {
    sim.windTunnelMode = false;
    sim.imageMode = false;
    
    btnPaint.classList.add('active');
    btnTunnel.classList.remove('active');
    btnImage.classList.remove('active');
    
    sim.smokeDecay = 0.980; 
    updateUIValues();

    groupTunnelCtrls.style.opacity = '0.3';
    groupTunnelCtrls.style.pointerEvents = 'none';
});

btnImage.addEventListener('click', () => {
    if (!currentUploadedImage) {
        fileUpload.click();
        return; 
    }

    // ELIMINAMOS EL TÚNEL: Solo deformación vía cursor.
    sim.windTunnelMode = false; 
    sim.imageMode = true;
    
    btnImage.classList.add('active');
    btnTunnel.classList.remove('active');
    btnPaint.classList.remove('active');
    
    // Atenuamos los controles del túnel ya que no se usarán
    groupTunnelCtrls.style.opacity = '0.3';
    groupTunnelCtrls.style.pointerEvents = 'none';

    sim.setImage(currentUploadedImage);
});

// --- SLIDERS Y BOTONES ---
document.getElementById('sld-wind').addEventListener('input', (e) => {
    sim.inletVelocity = parseFloat(e.target.value);
    document.getElementById('val-wind').textContent = sim.inletVelocity.toFixed(1);
});
document.getElementById('sld-inlet-size').addEventListener('input', (e) => {
    sim.inletSize = parseFloat(e.target.value);
    document.getElementById('val-inlet-size').textContent = sim.inletSize.toFixed(3);
});
document.getElementById('sld-decay').addEventListener('input', (e) => {
    sim.smokeDecay = parseFloat(e.target.value);
    document.getElementById('val-decay').textContent = sim.smokeDecay.toFixed(3);
});
document.getElementById('sld-force').addEventListener('input', (e) => {
    sim.splatForce = parseInt(e.target.value);
    document.getElementById('val-force').textContent = sim.splatForce;
});
document.getElementById('sld-radius').addEventListener('input', (e) => {
    sim.splatRadius = parseFloat(e.target.value);
    document.getElementById('val-radius').textContent = sim.splatRadius.toFixed(4);
});

document.getElementById('btn-add-circle').addEventListener('click', () => sim.obstacleManager.addObstacle(1));
document.getElementById('btn-add-square').addEventListener('click', () => sim.obstacleManager.addObstacle(2));

// Al reiniciar, la deformación de coordenadas vuelve a su estado inicial.
document.getElementById('btn-clear-fluid').addEventListener('click', () => sim.clearFluid());
document.getElementById('btn-clear-obs').addEventListener('click', () => sim.obstacleManager.clearObstacles());

function loop() {
    sim.step();
    sim.render();
    requestAnimationFrame(loop);
}

requestAnimationFrame(loop);