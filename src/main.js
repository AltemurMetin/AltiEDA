/**
 * AltiEDA – Main Application Entry Point
 * Wires together all modules: canvas, tools, sidebar, panels, simulation.
 */
import { CanvasRenderer }    from './core/canvasRenderer.js';
import { state }             from './core/schematicState.js';
import { COMPONENT_LIBRARY } from './core/componentLibrary.js';
import { createComponent }   from './core/dataModels.js';
import { generateSuggestions, acceptAllSuggestions } from './tools/aiPinMatcher.js';
import { WireTool, placeVia, placeProbeTool, getProbeNetName } from './tools/routingTools.js';
import { generateNetlist, switchToPCBMode, switchToSchematicMode } from './core/netlistGenerator.js';
import { runDRC, renderDRCPanel }  from './tools/drcEngine.js';
import { exportManufacturingPackage } from './export/exportPackager.js';
import { onComponentSelect, initPanel, hidePanel } from './ui/contextualPanel.js';
import { toggle2D3DView, renderLayerStackupUI } from './ui/threeDView.js';
import { runSimulation, initSimulationManager } from './simulation/simulationManager.js';

// ── Canvas setup ─────────────────────────────────────────────────────────────
const canvas   = document.getElementById('main-canvas');
const renderer = new CanvasRenderer(canvas);
let activeTool = null;  // 'wire' | 'via' | 'probe'
let wireTool   = new WireTool(renderer);
let probeType  = 'voltage';

// ── Sidebar: populate component library ──────────────────────────────────────
function buildSidebar() {
  const list     = document.getElementById('component-list');
  const search   = document.getElementById('comp-search');
  list.innerHTML = '';

  const query = search?.value.toLowerCase() ?? '';
  const filtered = COMPONENT_LIBRARY.filter(c =>
    c.partName.toLowerCase().includes(query) ||
    c.category.toLowerCase().includes(query)
  );

  for (const lib of filtered) {
    const div = document.createElement('div');
    div.className         = 'comp-item';
    div.draggable         = true;
    div.dataset.partId    = lib.partId;
    div.innerHTML = `
      <div class="comp-item-name">${lib.partName}</div>
      <div class="comp-item-type">${lib.category}</div>`;

    div.addEventListener('dragstart', e => {
      e.dataTransfer.setData('partId', lib.partId);
    });
    list.appendChild(div);
  }
}

document.getElementById('comp-search')?.addEventListener('input', buildSidebar);
buildSidebar();

// ── Drag & Drop onto canvas ───────────────────────────────────────────────────
canvas.addEventListener('dragover', e => { e.preventDefault(); });

canvas.addEventListener('drop', e => {
  e.preventDefault();
  const partId  = e.dataTransfer.getData('partId');
  if (!partId) return;

  const lib = COMPONENT_LIBRARY.find(c => c.partId === partId);
  if (!lib) return;

  const dropPt  = renderer.getCanvasDropPoint(e.clientX, e.clientY);
  const comp    = createComponent(lib, dropPt.x, dropPt.y);
  state.addComponent(comp);

  // AI suggestions
  const sugs = generateSuggestions(comp);
  renderer.suggestions = [...(renderer.suggestions ?? []), ...sugs];

  // Auto-accept power connections silently; show bus suggestions visually
  const powerSugs = sugs.filter(s => ['POWER', 'GND'].includes(s.netClass));
  acceptAllSuggestions(powerSugs);
  renderer.suggestions = sugs.filter(s => !['POWER', 'GND'].includes(s.netClass));

  renderer.render();
  setStatus(`Placed ${comp.partName} at (${dropPt.x}, ${dropPt.y})`);
});

// ── Pan (middle mouse / right mouse) ─────────────────────────────────────────
let _panning = false, _panStart = null;

canvas.addEventListener('mousedown', e => {
  if (e.button === 1 || e.button === 2) {
    _panning  = true;
    _panStart = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  } else if (e.button === 0) {
    handleLeftClick(e);
  }
});

canvas.addEventListener('mousemove', e => {
  if (_panning && _panStart) {
    renderer.pan(e.clientX - _panStart.x, e.clientY - _panStart.y);
    _panStart = { x: e.clientX, y: e.clientY };
  }
  if (activeTool === 'wire') {
    const rect = canvas.getBoundingClientRect();
    wireTool.preview(
      renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top).x,
      renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top).y
    );
    renderer.render();
  }
  // Probe tooltip
  updateProbeTooltip(e);
});

canvas.addEventListener('mouseup', () => { _panning = false; _panStart = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ── Zoom (wheel) ──────────────────────────────────────────────────────────────
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 1.1 : 0.9;
  renderer.zoomAt(e.offsetX, e.offsetY, factor);
});

// ── Click handler ─────────────────────────────────────────────────────────────
function handleLeftClick(e) {
  const rect   = canvas.getBoundingClientRect();
  const world  = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const snapped = renderer.snapToGrid(world.x, world.y);

  if (activeTool === 'wire') {
    if (!wireTool.active) {
      wireTool.begin(world.x, world.y);
    } else {
      const result = wireTool.commit(world.x, world.y);
      if (result?.error) {
        setStatus(`ERC: ${result.error}`, true);
      }
    }
    renderer.render();
    return;
  }

  if (activeTool === 'via') {
    placeVia(world.x, world.y, 'F.Cu', 'B.Cu', renderer);
    renderer.render();
    return;
  }

  if (activeTool === 'probe') {
    const probe = placeProbeTool(world.x, world.y, probeType, renderer);
    renderer.render();
    setStatus(`Probe placed on net: ${probe.netName ?? '(unconnected)'}`);
    return;
  }

  // Selection / component info click
  const hit = hitTestComponent(world.x, world.y);
  if (hit) {
    // Deselect all
    Object.values(state.schematic.components).forEach(c => c.selected = false);
    hit.selected = true;
    onComponentSelect(hit.partId);
    renderer.render();
  }
}

// ── Hit-test component ────────────────────────────────────────────────────────
function hitTestComponent(wx, wy) {
  const W = 4, H = 6;  // half-extents in grid units
  for (const comp of Object.values(state.schematic.components)) {
    if (wx > comp.x - W && wx < comp.x + W &&
        wy > comp.y - H && wy < comp.y + H) return comp;
  }
  return null;
}

// ── Probe tooltip ─────────────────────────────────────────────────────────────
function updateProbeTooltip(e) {
  const tooltip = document.getElementById('probe-tooltip');
  if (!tooltip) return;
  const rect  = canvas.getBoundingClientRect();
  const world = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);

  let found = null;
  for (const probe of Object.values(state.schematic.probes)) {
    if (Math.hypot(probe.x - world.x, probe.y - world.y) < 2) {
      found = probe; break;
    }
  }

  if (found) {
    tooltip.textContent = `${found.probeType.toUpperCase()} – Net: ${getProbeNetName(found)}`;
    tooltip.style.left  = `${e.clientX - rect.left + 12}px`;
    tooltip.style.top   = `${e.clientY - rect.top - 28}px`;
    tooltip.classList.remove('hidden');
  } else {
    tooltip.classList.add('hidden');
  }
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  switch (e.key.toLowerCase()) {
    case 'w':  setActiveTool('wire');  break;
    case 'v':  setActiveTool('via');   break;
    case 'p':  setActiveTool('probe'); break;
    case 'escape':
      setActiveTool(null);
      if (wireTool.active) wireTool.end();
      break;
    case 'delete':
      Object.values(state.schematic.components)
        .filter(c => c.selected)
        .forEach(c => state.removeComponent(c.id));
      renderer.render();
      break;
  }
});

// ── Toolbar buttons ───────────────────────────────────────────────────────────
document.getElementById('btn-wire')?.addEventListener('click', () => setActiveTool('wire'));
document.getElementById('btn-via')?.addEventListener('click',  () => setActiveTool('via'));
document.getElementById('btn-probe')?.addEventListener('click', () => setActiveTool('probe'));

document.getElementById('btn-drc')?.addEventListener('click', () => {
  const result = runDRC();
  renderDRCPanel(result);
  renderer.drcViolations = result.all.filter(v => v.x != null);
  renderer.render();
  setStatus(`DRC: ${result.errors.length} errors, ${result.warnings.length} warnings`);
});

document.getElementById('btn-close-drc')?.addEventListener('click', () => {
  document.getElementById('drc-panel')?.classList.add('hidden');
  renderer.drcViolations = [];
  renderer.render();
});

document.getElementById('btn-close-osc')?.addEventListener('click', () => {
  document.getElementById('oscilloscope-panel')?.classList.add('hidden');
});

document.getElementById('btn-export')?.addEventListener('click', async () => {
  setStatus('Packaging Gerbers…');
  await exportManufacturingPackage();
  setStatus('Export complete');
});

document.getElementById('btn-save')?.addEventListener('click', () => {
  const json = state.toJSON();
  localStorage.setItem('altieda_autosave', json);
  setStatus('Saved to local storage');
});

// ── Mode switcher ─────────────────────────────────────────────────────────────
document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const mode = btn.dataset.mode;

    const threeContainer = document.getElementById('three-container');

    if (mode === 'schematic') {
      switchToSchematicMode(renderer);
      toggle2D3DView('2d', canvas, threeContainer);
    } else if (mode === 'pcb') {
      toggle2D3DView('2d', canvas, threeContainer);
      switchToPCBMode(renderer);
    } else if (mode === '3d') {
      toggle2D3DView('3d', canvas, threeContainer);
    } else if (mode === 'simulation') {
      state.mode = 'simulation';
      initSimulationManager(pct => setStatus(`Simulating ${pct}%`));
      runSimulation();
    }
    setStatus(`Mode: ${mode}`);
  });
});

// ── Layer stackup modal ───────────────────────────────────────────────────────
document.getElementById('btn-close-layer')?.addEventListener('click', () => {
  document.getElementById('layer-modal')?.classList.add('hidden');
});

// ── Context panel init ────────────────────────────────────────────────────────
initPanel();
document.getElementById('btn-close-info')?.addEventListener('click', hidePanel);

// ── Restore autosave ──────────────────────────────────────────────────────────
const saved = localStorage.getItem('altieda_autosave');
if (saved) {
  try { state.fromJSON(saved); } catch { /* ignore corrupt saves */ }
}

// ── State subscriptions → re-render ──────────────────────────────────────────
state.subscribe(() => renderer.render());

// ── Utility ───────────────────────────────────────────────────────────────────
function setActiveTool(tool) {
  activeTool = tool;
  if (tool === null && wireTool.active) wireTool.end();
  document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
  if (tool === 'wire')  document.getElementById('btn-wire')?.classList.add('active');
  if (tool === 'via')   document.getElementById('btn-via')?.classList.add('active');
  if (tool === 'probe') document.getElementById('btn-probe')?.classList.add('active');
  canvas.style.cursor = tool ? 'crosshair' : 'default';
  setStatus(tool ? `Tool: ${tool}` : 'Ready');
}

function setStatus(msg, isError = false) {
  const bar = document.getElementById('status-bar');
  if (bar) {
    bar.textContent = msg;
    bar.style.color = isError ? '#f44336' : '#8888aa';
  }
}

// Initial render
renderer.render();
setStatus('Ready – drag components from the sidebar to start');
