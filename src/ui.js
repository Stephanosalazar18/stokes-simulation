// Spanish UI: theorem panel, mode switcher, radius slider.

export function createUI() {
  const body = document.body;

  // --- Theorem panel (top-left) ---
  const panel = document.createElement('div');
  panel.id = 'theorem-panel';
  panel.style.cssText = `
    position: fixed;
    top: 16px;
    left: 16px;
    width: 260px;
    background: rgba(20, 20, 30, 0.88);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 14px 16px;
    z-index: 20;
    font-family: system-ui, sans-serif;
    color: #e0e0e0;
    font-size: 13px;
    line-height: 1.6;
    pointer-events: auto;
  `;

  panel.innerHTML = `
    <div style="font-weight:600;font-size:15px;margin-bottom:10px;color:#4caf50;">
      Teorema de Stokes
    </div>
    <div>Circulación <span style="font-family:serif;font-size:14px;">∮ F·dr</span>:</div>
    <div id="val-line" style="font-weight:700;font-size:16px;color:#fff;margin-bottom:8px;">0.000</div>
    <div>Flujo del rotacional <span style="font-family:serif;font-size:14px;">∬ (∇×F)·dS</span>:</div>
    <div id="val-surface" style="font-weight:700;font-size:16px;color:#fff;margin-bottom:8px;">0.000</div>
    <div style="display:flex;align-items:center;gap:6px;">
      <span>Cociente:</span>
      <span id="val-ratio" style="font-weight:700;font-size:16px;">0.000</span>
      <span id="val-check" style="font-size:13px;"></span>
    </div>
  `;
  body.appendChild(panel);

  const elLine    = panel.querySelector('#val-line');
  const elSurface = panel.querySelector('#val-surface');
  const elRatio   = panel.querySelector('#val-ratio');
  const elCheck   = panel.querySelector('#val-check');

  // --- Mode switcher (top-center) ---
  const switcher = document.createElement('div');
  switcher.id = 'mode-switcher';
  switcher.style.cssText = `
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    z-index: 20;
  `;

  const modes = [
    { id: 1, label: '1. Contornos 2D' },
    { id: 2, label: '2. Gradientes 3D' },
    { id: 3, label: '3. Imagen' },
    { id: 4, label: '4. Modo completo' }
  ];

  const buttons = [];
  modes.forEach(m => {
    const btn = document.createElement('button');
    btn.textContent = m.label;
    btn.dataset.mode = m.id;
    btn.style.cssText = `
      background: rgba(20, 20, 30, 0.88);
      color: #e0e0e0;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      padding: 6px 14px;
      cursor: pointer;
      font-size: 14px;
      font-family: system-ui, sans-serif;
      transition: background 0.15s;
    `;
    btn.addEventListener('mouseenter', () => {
      if (!btn.classList.contains('active'))
        btn.style.background = 'rgba(60,60,80,0.9)';
    });
    btn.addEventListener('mouseleave', () => {
      if (!btn.classList.contains('active'))
        btn.style.background = 'rgba(20, 20, 30, 0.88)';
    });
    switcher.appendChild(btn);
    buttons.push(btn);
  });

  body.appendChild(switcher);

  // --- Controls (bottom-left) ---
  const controls = document.createElement('div');
  controls.id = 'controls';
  controls.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 16px;
    background: rgba(20, 20, 30, 0.88);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 12px 16px;
    z-index: 20;
    font-family: system-ui, sans-serif;
    color: #e0e0e0;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  `;

  const radiusLabel = document.createElement('label');
  radiusLabel.textContent = 'Radio de C';
  radiusLabel.style.cssText = 'font-weight:500;';

  const radiusSlider = document.createElement('input');
  radiusSlider.type = 'range';
  radiusSlider.min = '0.05';
  radiusSlider.max = '0.40';
  radiusSlider.step = '0.01';
  radiusSlider.value = '0.15';
  radiusSlider.style.cssText = 'width:200px;accent-color:#4caf50;';

  const radiusValue = document.createElement('span');
  radiusValue.id = 'radius-value';
  radiusValue.textContent = '0.15';
  radiusValue.style.cssText = 'text-align:right;font-weight:600;';

  controls.appendChild(radiusLabel);
  controls.appendChild(radiusSlider);
  controls.appendChild(radiusValue);

  body.appendChild(controls);

  // --- Placeholder panel for stub modes (top-right) ---
  const placeholder = document.createElement('div');
  placeholder.id = 'placeholder-panel';
  placeholder.style.cssText = `
    position: fixed;
    top: 16px;
    right: 16px;
    background: rgba(20, 20, 30, 0.88);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 14px 20px;
    z-index: 20;
    font-family: system-ui, sans-serif;
    color: #e0e0e0;
    font-size: 16px;
    display: none;
  `;
  placeholder.textContent = 'Próximamente';
  body.appendChild(placeholder);

  // --- Return references ---
  return {
    updateTheorem({ lineIntegral, surfaceIntegral, ratio }) {
      elLine.textContent = lineIntegral.toFixed(4);
      elSurface.textContent = surfaceIntegral.toFixed(4);
      elRatio.textContent = ratio.toFixed(4);
      if (Math.abs(ratio - 1.0) < 0.05) {
        elCheck.textContent = '✓';
        elCheck.style.color = '#4caf50';
      } else {
        elCheck.textContent = '…';
        elCheck.style.color = '#ffa726';
      }
    },
    onModeChange(callback) {
      buttons.forEach(btn => {
        btn.addEventListener('click', () => {
          buttons.forEach(b => {
            b.classList.remove('active');
            b.style.borderColor = 'rgba(255,255,255,0.15)';
            b.style.color = '#e0e0e0';
          });
          btn.classList.add('active');
          btn.style.borderColor = '#4caf50';
          btn.style.color = '#4caf50';
          callback(parseInt(btn.dataset.mode));
        });
      });
    },
    onRadiusChange(callback) {
      radiusSlider.addEventListener('input', () => {
        const val = parseFloat(radiusSlider.value);
        radiusValue.textContent = val.toFixed(2);
        callback(val);
      });
    },
    getRadius() { return parseFloat(radiusSlider.value); },
    setActiveMode(id) {
      buttons.forEach(b => {
        b.classList.remove('active');
        b.style.borderColor = 'rgba(255,255,255,0.15)';
        b.style.color = '#e0e0e0';
      });
      const target = buttons.find(b => parseInt(b.dataset.mode) === id);
      if (target) {
        target.classList.add('active');
        target.style.borderColor = '#4caf50';
        target.style.color = '#4caf50';
      }
    },
    showPlaceholder(show) {
      placeholder.style.display = show ? 'block' : 'none';
    },
    buttons,
    panel,
    switcher,
    controls
  };
}
