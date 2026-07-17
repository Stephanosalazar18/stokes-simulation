export class ObstacleManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.maxObstacles = 10;
        this.obstacles = [
            { pos: [0.3, 0.5], size: 0.05, type: 1 } // Obstáculo inicial por defecto
        ];
        this.selectedIndex = -1;
        this.isDragging = false;
        
        this.initInteraction();
    }

    addObstacle(type) {
        if (this.obstacles.length >= this.maxObstacles) return;
        // Colocar aleatoriamente en el centro-derecha
        const x = 0.4 + Math.random() * 0.3;
        const y = 0.3 + Math.random() * 0.4;
        this.obstacles.push({ pos: [x, y], size: 0.04, type: type });
    }

    clearObstacles() {
        this.obstacles = [];
        this.selectedIndex = -1;
    }

    initInteraction() {
        this.canvas.addEventListener('wheel', (e) => {
            if (this.selectedIndex === -1) return;
            const obs = this.obstacles[this.selectedIndex];
            obs.size += e.deltaY * -0.0001;
            obs.size = Math.max(0.015, Math.min(obs.size, 0.2));
        });

        this.canvas.addEventListener('mousedown', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const mouseX = (e.clientX - rect.left) / rect.width;
            const mouseY = 1.0 - (e.clientY - rect.top) / rect.height;
            const aspect = this.canvas.width / this.canvas.height;

            this.selectedIndex = -1;
            // Iterar al revés para seleccionar la figura superior en caso de solapamiento
            for (let i = this.obstacles.length - 1; i >= 0; i--) {
                const obs = this.obstacles[i];
                const dx = (mouseX - obs.pos[0]) * aspect;
                const dy = (mouseY - obs.pos[1]);
                
                if (Math.sqrt(dx*dx + dy*dy) < obs.size) {
                    this.selectedIndex = i;
                    this.isDragging = true;
                    break;
                }
            }
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (this.isDragging && this.selectedIndex !== -1) {
                const rect = this.canvas.getBoundingClientRect();
                const obs = this.obstacles[this.selectedIndex];
                obs.pos[0] = (e.clientX - rect.left) / rect.width;
                obs.pos[1] = 1.0 - (e.clientY - rect.top) / rect.height;
            }
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
        });
    }

    bindUniforms(gl, uniforms, simWidth, simHeight) {
        const count = this.obstacles.length;
        const positions = new Float32Array(this.maxObstacles * 2);
        const sizes = new Float32Array(this.maxObstacles);
        const types = new Int32Array(this.maxObstacles);

        for (let i = 0; i < count; i++) {
            positions[i * 2] = this.obstacles[i].pos[0];
            positions[i * 2 + 1] = this.obstacles[i].pos[1];
            sizes[i] = this.obstacles[i].size;
            types[i] = this.obstacles[i].type;
        }

        const aspect = this.canvas.width / this.canvas.height;
        
        if (uniforms['uObstaclePos[0]']) gl.uniform2fv(uniforms['uObstaclePos[0]'], positions);
        if (uniforms['uObstacleSize[0]']) gl.uniform1fv(uniforms['uObstacleSize[0]'], sizes);
        if (uniforms['uObstacleType[0]']) gl.uniform1iv(uniforms['uObstacleType[0]'], types);
        if (uniforms.uObstacleCount) gl.uniform1i(uniforms.uObstacleCount, count);
        if (uniforms.uAspectRatio) gl.uniform1f(uniforms.uAspectRatio, aspect);
        if (uniforms.uResolution) gl.uniform2f(uniforms.uResolution, simWidth, simHeight);
    }
}