/**
 * AltiEDA – Main Entry Point (Altium-style UI)
 */
import { CanvasRenderer }    from './core/canvasRenderer.js';
import { state }             from './core/schematicState.js';
import { COMPONENT_LIBRARY } from './core/componentLibrary.js';
import { createComponent }   from './core/dataModels.js';
import { generateSuggestions, acceptAllSuggestions } from './tools/aiPinMatcher.js';
import { WireTool, placeVia, placeProbeTool, getProbeNetName } from './tools/routingTools.js';
import { generateNetlist, switchToPCBMode, switchToSchematicMode } from './core/netlistGenerator.js';
import { runDRC, renderDRCPanel }          from './tools/drcEngine.js';
import { exportManufacturingPackage }      from './export/exportPackager.js';
import { onComponentSelect, initPanel, hidePanel } from './ui/contextualPanel.js';
import { toggle2D3DView, renderLayerStackupUI }     from './ui/threeDView.js';
import { runSimulation, initSimulationManager }     from './simulation/simulationManager.js';

// ── Canvas ────────────────────────────────────────────────────────────────────
const canvas   = document.getElementById('main-canvas');
const renderer = new CanvasRenderer(canvas);
let activeTool = null;
let wireTool   = new WireTool(renderer);

// ── Sidebar: Component Library ────────────────────────────────────────────────
function buildSidebar() {
  const list  = document.getElementById('component-list');
  const query = document.getElementById('comp-search')?.value.toLowerCase() ?? '';

  const filtered = COMPONENT_LIBRARY.filter(c =>
    c.partName.toLowerCase().includes(query) ||
    c.category.toLowerCase().includes(query)
  );

  // Group by category
  const groups = {};
  for (const c of filtered) {
    (groups[c.category] ??= []).push(c);
  }

  list.innerHTML = '';

  for (const [cat, items] of Object.entries(groups)) {
    const hdr = document.createElement('div');
    hdr.className = 'lib-category';
    hdr.textContent = cat;
    list.appendChild(hdr);

    for (const lib of items) {
      const div = document.createElement('div');
      div.className      = 'comp-item';
      div.draggable      = true;
      div.dataset.partId = lib.partId;

      div.innerHTML = `
        <div class="comp-icon">${compIcon(lib.partId)}</div>
        <div class="comp-info">
          <div class="comp-name">${lib.partName}</div>
          <div class="comp-cat">${lib.footprintId ?? '—'}</div>
        </div>`;

      div.addEventListener('dragstart', e => e.dataTransfer.setData('partId', lib.partId));
      list.appendChild(div);
    }
  }
}

function compIcon(partId) {
  const icons = {
    R_GENERIC:  `<svg viewBox="-40 -12 80 24" stroke="#4ec9b0" fill="none" stroke-width="2" stroke-linecap="round"><line x1="-36" y1="0" x2="-20" y2="0"/><polyline points="-20,0 -15,-8 -5,8 5,-8 15,8 20,0"/><line x1="20" y1="0" x2="36" y2="0"/></svg>`,
    C_GENERIC:  `<svg viewBox="-32 -16 64 32" stroke="#4ec9b0" fill="none" stroke-width="2" stroke-linecap="round"><line x1="-28" y1="0" x2="-5" y2="0"/><line x1="5" y1="0" x2="28" y2="0"/><line x1="-5" y1="-14" x2="-5" y2="14"/><line x1="5" y1="-14" x2="5" y2="14"/></svg>`,
    LED_GENERIC:`<svg viewBox="-36 -16 72 32" stroke="#4ec9b0" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="-32" y1="0" x2="-12" y2="0"/><polygon points="-12,-12 -12,12 12,0" fill="rgba(78,201,176,0.2)"/><line x1="12" y1="-12" x2="12" y2="12"/><line x1="12" y1="0" x2="32" y2="0"/></svg>`,
    PWR_VCC:    `<svg viewBox="-16 -20 32 36" stroke="#f44747" fill="none" stroke-width="2"><line x1="0" y1="14" x2="0" y2="-4"/><polygon points="0,-16 -10,-4 10,-4" fill="rgba(244,71,71,0.25)" stroke="#f44747"/></svg>`,
    PWR_GND:    `<svg viewBox="-18 -10 36 32" stroke="#6a9955" fill="none" stroke-width="2"><line x1="0" y1="-8" x2="0" y2="4"/><line x1="-16" y1="4" x2="16" y2="4"/><line x1="-10" y1="10" x2="10" y2="10"/><line x1="-4" y1="16" x2="4" y2="16"/></svg>`,
  };
  return icons[partId] ?? `<svg viewBox="-20 -16 40 32" stroke="#569cd6" fill="#252526" stroke-width="1.5"><rect x="-18" y="-14" width="36" height="28" rx="2"/></svg>`;
}

document.getElementById('comp-search')?.addEventListener('input', buildSidebar);
buildSidebar();

// ── Drag & Drop ───────────────────────────────────────────────────────────────
canvas.addEventListener('dragover', e => e.preventDefault());

canvas.addEventListener('drop', e => {
  e.preventDefault();
  const partId = e.dataTransfer.getData('partId');
  if (!partId) return;
  const lib = COMPONENT_LIBRARY.find(c => c.partId === partId);
  if (!lib) return;

  const pt   = renderer.getCanvasDropPoint(e.clientX, e.clientY);
  const comp = createComponent(lib, pt.x, pt.y);
  state.addComponent(comp);

  const sugs   = generateSuggestions(comp);
  const powerS = sugs.filter(s => ['POWER','GND'].includes(s.netClass));
  acceptAllSuggestions(powerS);
  renderer.suggestions = sugs.filter(s => !['POWER','GND'].includes(s.netClass));

  renderer.render();
  setMsg(`Placed ${comp.partName} at (${pt.x.toFixed(0)}, ${pt.y.toFixed(0)})`);
});

// ── Mouse: pan / click ────────────────────────────────────────────────────────
let _pan = false, _panPt = null;

canvas.addEventListener('mousedown', e => {
  if (e.button === 1 || e.button === 2) {
    _pan = true; _panPt = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  } else if (e.button === 0) {
    handleClick(e);
  }
});

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  const w    = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

  // Update coordinate display
  const mm = (v) => (v * 2.54).toFixed(2);
  document.getElementById('sb-coords').textContent =
    `X: ${mm(w.x)} mm  Y: ${mm(w.y)} mm`;

  if (_pan && _panPt) {
    renderer.pan(e.clientX - _panPt.x, e.clientY - _panPt.y);
    _panPt = { x: e.clientX, y: e.clientY };
  }

  if (activeTool === 'wire' && wireTool.active) {
    renderer._wirePreview = { x1: wireTool.startX, y1: wireTool.startY, x2: w.x, y2: w.y };
    renderer.render();
  }

  updateProbeTooltip(e);
});

canvas.addEventListener('mouseup', () => { _pan = false; _panPt = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ── Zoom ──────────────────────────────────────────────────────────────────────
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  renderer.zoomAt(e.offsetX, e.offsetY, e.deltaY < 0 ? 1.12 : 0.88);
  updateZoomDisplay();
}, { passive: false });

function updateZoomDisplay() {
  document.getElementById('sb-zoom').textContent =
    `Zoom: ${(renderer.zoom * 100).toFixed(0)}%`;
}

// ── Click handler ─────────────────────────────────────────────────────────────
function handleClick(e) {
  const rect   = canvas.getBoundingClientRect();
  const world  = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const snapped = renderer.snap(world.x, world.y);

  if (activeTool === 'wire') {
    if (!wireTool.active) {
      wireTool.begin(world.x, world.y);
      setMsg('Click to place second endpoint — ESC to cancel');
    } else {
      renderer._wirePreview = null;
      const result = wireTool.commit(world.x, world.y);
      if (result?.error) setMsg(`ERC: ${result.error}`, true);
      else setMsg('Wire placed — click to continue or ESC to stop');
    }
    renderer.render(); return;
  }

  if (activeTool === 'via') {
    placeVia(world.x, world.y, 'F.Cu', 'B.Cu', renderer);
    renderer.render(); return;
  }

  if (activeTool === 'probe') {
    const probe = placeProbeTool(world.x, world.y, 'voltage', renderer);
    setMsg(`Probe on net: ${probe.netName ?? '(unconnected)'}`);
    renderer.render(); return;
  }

  // Selection
  const hit = hitTest(world.x, world.y);
  Object.values(state.schematic.components).forEach(c => c.selected = false);
  if (hit) {
    hit.selected = true;
    onComponentSelect(hit.partId);
  } else {
    hidePanel();
  }
  renderer.render();
}

function hitTest(wx, wy) {
  for (const comp of Object.values(state.schematic.components)) {
    if (wx > comp.x - 5 && wx < comp.x + 5 &&
        wy > comp.y - 6 && wy < comp.y + 6) return comp;
  }
  return null;
}

// ── Probe tooltip ─────────────────────────────────────────────────────────────
function updateProbeTooltip(e) {
  const tt   = document.getElementById('probe-tooltip');
  if (!tt) return;
  const rect  = canvas.getBoundingClientRect();
  const world = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  let found = null;
  for (const p of Object.values(state.schematic.probes)) {
    if (Math.hypot(p.x - world.x, p.y - world.y) < 2) { found = p; break; }
  }
  if (found) {
    tt.textContent = `${found.probeType.toUpperCase()} – ${getProbeNetName(found)}`;
    tt.style.left  = `${e.clientX - rect.left + 14}px`;
    tt.style.top   = `${e.clientY - rect.top  - 32}px`;
    tt.classList.remove('hidden');
  } else {
    tt.classList.add('hidden');
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  switch (e.key.toLowerCase()) {
    case 'w':  setTool('wire');  break;
    case 'v':  setTool('via');   break;
    case 'p':  setTool('probe'); break;
    case 'g':  renderer.showGrid = !renderer.showGrid; renderer.render(); break;
    case '+':  case '=': renderer.zoomAt(canvas.width/2, canvas.height/2, 1.25); updateZoomDisplay(); break;
    case '-':  renderer.zoomAt(canvas.width/2, canvas.height/2, 0.8); updateZoomDisplay(); break;
    case 'escape':
      renderer._wirePreview = null;
      if (wireTool.active) wireTool.end();
      setTool(null);
      break;
    case 'delete':
    case 'backspace':
      Object.values(state.schematic.components)
        .filter(c => c.selected)
        .forEach(c => state.removeComponent(c.id));
      renderer.render();
      break;
  }
  if (e.ctrlKey) {
    if (e.key === 's') { e.preventDefault(); saveLocal(); }
    if (e.key === '0') { e.preventDefault(); renderer.fitAll(); updateZoomDisplay(); }
    if (e.key === 'a') {
      e.preventDefault();
      Object.values(state.schematic.components).forEach(c => c.selected = true);
      renderer.render();
    }
  }
});

// ── Toolbar buttons ───────────────────────────────────────────────────────────
document.getElementById('btn-wire')?.addEventListener('click',  () => setTool('wire'));
document.getElementById('btn-via')?.addEventListener('click',   () => setTool('via'));
document.getElementById('btn-probe')?.addEventListener('click', () => setTool('probe'));

document.getElementById('btn-zoom-in')?.addEventListener('click',
  () => { renderer.zoomAt(canvas.width/2, canvas.height/2, 1.25); updateZoomDisplay(); });
document.getElementById('btn-zoom-out')?.addEventListener('click',
  () => { renderer.zoomAt(canvas.width/2, canvas.height/2, 0.8);  updateZoomDisplay(); });
document.getElementById('btn-fit')?.addEventListener('click',
  () => { renderer.fitAll(); updateZoomDisplay(); });

document.getElementById('btn-drc')?.addEventListener('click', () => {
  const result = runDRC();
  renderDRCPanel(result);
  renderer.drcViolations = result.all.filter(v => v.x != null);
  renderer.render();
  setMsg(`DRC: ${result.errors.length} errors, ${result.warnings.length} warnings`);
});

document.getElementById('btn-export')?.addEventListener('click', async () => {
  setMsg('Generating Gerber files…');
  await exportManufacturingPackage();
  setMsg('Export complete — check downloads');
});

document.getElementById('btn-save')?.addEventListener('click', saveLocal);

document.getElementById('btn-close-drc')?.addEventListener('click', () => {
  document.getElementById('drc-panel')?.classList.add('hidden');
  renderer.drcViolations = []; renderer.render();
});
document.getElementById('btn-close-osc')?.addEventListener('click', () =>
  document.getElementById('oscilloscope-panel')?.classList.add('hidden'));
document.getElementById('btn-close-layer')?.addEventListener('click', () =>
  document.getElementById('layer-modal')?.classList.add('hidden'));
document.getElementById('btn-close-info')?.addEventListener('click', hidePanel);

// Menu entries wired up
document.getElementById('menu-save')?.addEventListener('click',    saveLocal);
document.getElementById('menu-export')?.addEventListener('click',  () => document.getElementById('btn-export').click());
document.getElementById('menu-drc')?.addEventListener('click',     () => document.getElementById('btn-drc').click());
document.getElementById('menu-fitall')?.addEventListener('click',  () => { renderer.fitAll(); updateZoomDisplay(); });
document.getElementById('menu-zoomin')?.addEventListener('click',  () => { renderer.zoomAt(canvas.width/2,canvas.height/2,1.25); updateZoomDisplay(); });
document.getElementById('menu-zoomout')?.addEventListener('click', () => { renderer.zoomAt(canvas.width/2,canvas.height/2,0.8);  updateZoomDisplay(); });
document.getElementById('menu-grid')?.addEventListener('click',    () => { renderer.showGrid=!renderer.showGrid; renderer.render(); });
document.getElementById('menu-wire')?.addEventListener('click',    () => setTool('wire'));
document.getElementById('menu-via')?.addEventListener('click',     () => setTool('via'));
document.getElementById('menu-probe')?.addEventListener('click',   () => setTool('probe'));
document.getElementById('menu-selall')?.addEventListener('click',  () => {
  Object.values(state.schematic.components).forEach(c => c.selected=true); renderer.render();
});

// ── Mode switcher ─────────────────────────────────────────────────────────────
document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;
    const three = document.getElementById('three-container');

    if (mode === 'schematic') {
      switchToSchematicMode(renderer);
      toggle2D3DView('2d', canvas, three);
    } else if (mode === 'pcb') {
      toggle2D3DView('2d', canvas, three);
      switchToPCBMode(renderer);
    } else if (mode === '3d') {
      toggle2D3DView('3d', canvas, three);
    } else if (mode === 'simulation') {
      state.mode = 'simulation';
      initSimulationManager(pct => setMsg(`Simulating… ${pct}%`));
      runSimulation();
    }
    setMsg(`Mode: ${mode}`);
  });
});

// ── Autosave restore ──────────────────────────────────────────────────────────
const saved = localStorage.getItem('altieda_autosave');
if (saved) { try { state.fromJSON(saved); } catch { /* ignore */ } }

state.subscribe(() => renderer.render());

// ── Context panel ─────────────────────────────────────────────────────────────
initPanel();

// ── Utilities ─────────────────────────────────────────────────────────────────
function setTool(tool) {
  activeTool = tool;
  renderer._wirePreview = null;
  if (tool === null && wireTool.active) wireTool.end();

  document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
  if (tool === 'wire')  document.getElementById('btn-wire')?.classList.add('active');
  if (tool === 'via')   document.getElementById('btn-via')?.classList.add('active');
  if (tool === 'probe') document.getElementById('btn-probe')?.classList.add('active');

  canvas.style.cursor = tool ? 'crosshair' : 'default';

  const ind = document.getElementById('tool-indicator');
  if (tool) {
    ind.textContent = `● ${tool.toUpperCase()} TOOL`;
    ind.classList.remove('hidden');
  } else {
    ind.classList.add('hidden');
  }

  document.getElementById('sb-tool').textContent = tool
    ? tool.charAt(0).toUpperCase() + tool.slice(1)
    : 'Select';

  setMsg(tool
    ? `${tool} tool active — click on canvas to place`
    : 'Select tool — drag components from sidebar or press W/V/P');
}

function saveLocal() {
  const json = state.toJSON();
  localStorage.setItem('altieda_autosave', json);
  setMsg('Project saved to browser storage');
}

function setMsg(msg) {
  const el = document.getElementById('sb-msg');
  if (el) el.textContent = msg;
}

// ── Initial render ────────────────────────────────────────────────────────────
renderer.render();
updateZoomDisplay();
setMsg('Ready — drag components from the sidebar onto the canvas to begin');
