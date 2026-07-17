import { obstacleFragmentShader } from './obstacle-shader.js';
import { compileShader, createProgram } from './webgl-utils.js';

export class ObstacleMode {
    constructor(simulation) {
        this.simulation = simulation;
        this.obstacles = [];
        this.maxObstacles = 16;
        this.inletVelocity = 2.0;
        this.draggingObstacle = null;
        this.dragOffset = { x: 0, y: 0 };
        
        this.initShader();
        this.initDefaultObstacles();
        this.initInteraction();
    }
    
    initShader() {
        const gl = this.simulation.gl;
        const vs = compileShader(gl, gl.VERTEX_SHADER, this.simulation.vertexShaderSource);
        this.obstacleProgram = createProgram(gl, vs, compileShader(gl, gl.FRAGMENT_SHADER, obstacleFragmentShader));
    }
    
    initDefaultObstacles() {
        this.addObstacle(0.3, 0.5, 0.05);
        this.addObstacle(0.5, 0.3, 0.04);
        this.addObstacle(0.5, 0.7, 0.04);
    }
    
    addObstacle(x, y, radius) {
        if (this.obstacles.length >= this.maxObstacles) return;
        this.obstacles.push({ x, y, radius });
    }
    
    removeObstacle(index) {
        if (index >= 0 && index < this.obstacles.length) {
            this.obstacles.splice(index, 1);
        }
    }
    
    initInteraction() {
        const canvas = this.simulation.canvas;
        
        canvas.addEventListener('mousedown', (e) => {
            const pos = this.getMousePos(e);
            const obstacleIndex = this.findObstacleAt(pos.x, pos.y);
            
            if (obstacleIndex !== -1) {
                this.draggingObstacle = obstacleIndex;
                this.dragOffset.x = pos.x - this.obstacles[obstacleIndex].x;
                this.dragOffset.y = pos.y - this.obstacles[obstacleIndex].y;
                e.stopPropagation();
            }
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (this.draggingObstacle !== null) {
                const pos = this.getMousePos(e);
                this.obstacles[this.draggingObstacle].x = pos.x - this.dragOffset.x;
                this.obstacles[this.draggingObstacle].y = pos.y - this.dragOffset.y;
                e.stopPropagation();
            }
        });
        
        canvas.addEventListener('mouseup', () => {
            this.draggingObstacle = null;
        });
        
        canvas.addEventListener('touchstart', (e) => {
            const pos = this.getTouchPos(e);
            const obstacleIndex = this.findObstacleAt(pos.x, pos.y);
            
            if (obstacleIndex !== -1) {
                this.draggingObstacle = obstacleIndex;
                this.dragOffset.x = pos.x - this.obstacles[obstacleIndex].x;
                this.dragOffset.y = pos.y - this.obstacles[obstacleIndex].y;
                e.preventDefault();
                e.stopPropagation();
            }
        }, { passive: false });
        
        canvas.addEventListener('touchmove', (e) => {
            if (this.draggingObstacle !== null) {
                const pos = this.getTouchPos(e);
                this.obstacles[this.draggingObstacle].x = pos.x - this.dragOffset.x;
                this.obstacles[this.draggingObstacle].y = pos.y - this.dragOffset.y;
                e.preventDefault();
                e.stopPropagation();
            }
        }, { passive: false });
        
        canvas.addEventListener('touchend', () => {
            this.draggingObstacle = null;
        });
    }
    
    getMousePos(e) {
        const rect = this.simulation.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / rect.width,
            y: 1.0 - (e.clientY - rect.top) / rect.height
        };
    }
    
    getTouchPos(e) {
        const rect = this.simulation.canvas.getBoundingClientRect();
        const touch = e.targetTouches[0];
        return {
            x: (touch.clientX - rect.left) / rect.width,
            y: 1.0 - (touch.clientY - rect.top) / rect.height
        };
    }
    
    findObstacleAt(x, y) {
        for (let i = 0; i < this.obstacles.length; i++) {
            const obs = this.obstacles[i];
            const dist = Math.sqrt((x - obs.x) ** 2 + (y - obs.y) ** 2);
            if (dist < obs.radius * 1.5) {
                return i;
            }
        }
        return -1;
    }
    
    applyObstacles() {
        const gl = this.simulation.gl;
        const sim = this.simulation;
        
        gl.useProgram(this.obstacleProgram.program);
        
        const positions = new Float32Array(this.maxObstacles * 2);
        const radii = new Float32Array(this.maxObstacles);
        
        for (let i = 0; i < this.obstacles.length; i++) {
            positions[i * 2] = this.obstacles[i].x;
            positions[i * 2 + 1] = this.obstacles[i].y;
            radii[i] = this.obstacles[i].radius;
        }
        
        gl.uniform2fv(this.obstacleProgram.uniforms['uObstacles[0]'], positions);
        gl.uniform1fv(this.obstacleProgram.uniforms['uRadii[0]'], radii);
        gl.uniform1i(this.obstacleProgram.uniforms.uObstacleCount, this.obstacles.length);
        gl.uniform1f(this.obstacleProgram.uniforms.uInletVelocity, this.inletVelocity);
        gl.uniform2f(this.obstacleProgram.uniforms.uResolution, sim.simWidth, sim.simHeight);
        
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sim.velocityFBO.read.texture);
        gl.uniform1i(this.obstacleProgram.uniforms.uVelocity, 0);
        
        sim.blit(sim.velocityFBO.write);
        sim.velocityFBO.swap();
    }
    
    render() {
        const gl = this.simulation.gl;
        const canvas = this.simulation.canvas;
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        
        const scaleX = canvas.width / this.simulation.simWidth;
        const scaleY = canvas.height / this.simulation.simHeight;
        
        for (const obs of this.obstacles) {
            const x = obs.x * canvas.width;
            const y = (1.0 - obs.y) * canvas.height;
            const radius = obs.radius * Math.min(canvas.width, canvas.height);
            
            gl.enable(gl.SCISSOR_TEST);
            gl.scissor(x - radius, y - radius, radius * 2, radius * 2);
            
            gl.clearColor(0.3, 0.3, 0.3, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            
            gl.disable(gl.SCISSOR_TEST);
        }
    }
}
