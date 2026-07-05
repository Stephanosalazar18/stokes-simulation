// Stokes Theorem Simulator — entry point.
// Wires the fluid simulation, theorem overlay, and Spanish UI.

import { createUI } from './ui.js';
import { Mode1 } from './mode1.js';
import { Mode2 } from './mode2.js';
import { Mode3 } from './mode3.js';
import { Mode4 } from './mode4.js';

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('fluid');
  if (!canvas) {
    console.error('Canvas #fluid not found');
    return;
  }

  // Create UI
  const ui = createUI();

  // Current mode
  let currentMode = null;
  let currentModeId = 2;

  // Theorem update callback
  function onTheoremUpdate(values) {
    ui.updateTheorem(values);
  }

  // Mode factory
  function createMode(id) {
    switch (id) {
      case 1: return new Mode1(canvas, onTheoremUpdate);
      case 2: return new Mode2(canvas, onTheoremUpdate);
      case 3: return new Mode3(canvas, onTheoremUpdate);
      case 4: return new Mode4(canvas, onTheoremUpdate);
      default: return new Mode1(canvas, onTheoremUpdate);
    }
  }

  // Switch mode
  function switchMode(id) {
    if (currentMode) {
      currentMode.dispose();
      currentMode = null;
    }
    currentMode = createMode(id);
    currentModeId = id;
    ui.setActiveMode(id);

    // Show/hide placeholder for stub modes
    ui.showPlaceholder(id !== 2);

    // Pass current radius to new mode
    currentMode.setRadius?.(ui.getRadius());
  }

  // Start with Mode 2
  switchMode(2);

  // Wire mode switcher
  ui.onModeChange(id => {
    switchMode(id);
  });

  // Wire radius slider
  ui.onRadiusChange(r => {
    currentMode?.setRadius?.(r);
  });

  // Resize handler
  function handleResize() {
    // Canvas is auto-sized by CSS; FluidSim detects pixel ratio changes in step
  }
  window.addEventListener('resize', handleResize);

  // Animation loop
  let lastTime = performance.now();
  function loop(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.1) dt = 0.1; // Clamp large dt (e.g., tab switch)

    if (currentMode) {
      currentMode.step(dt);
    }

    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
});
