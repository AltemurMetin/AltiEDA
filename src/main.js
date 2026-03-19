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

      // ── Touch drag from sidebar → canvas ──
      let _ghost = null;
      div.addEventListener('touchstart', e => {
        e.stopPropagation();
        const t = e.touches[0];
        _ghost = document.createElement('div');
        _ghost.textContent = lib.partName;
        Object.assign(_ghost.style, {
          position: 'fixed', zIndex: '9999', pointerEvents: 'none',
          background: 'rgba(78,201,176,0.25)', border: '1px solid #4ec9b0',
          color: '#4ec9b0', padding: '4px 12px', borderRadius: '4px',
          fontSize: '12px', fontFamily: 'monospace',
          left: `${t.clientX + 12}px`, top: `${t.clientY - 24}px`,
        });
        document.body.appendChild(_ghost);
      }, { passive: true });

      div.addEventListener('touchmove', e => {
        e.preventDefault();
        const t = e.touches[0];
        if (_ghost) {
          _ghost.style.left = `${t.clientX + 12}px`;
          _ghost.style.top  = `${t.clientY - 24}px`;
        }
      }, { passive: false });

      div.addEventListener('touchend', e => {
        if (_ghost) { document.body.removeChild(_ghost); _ghost = null; }
        const t  = e.changedTouches[0];
        const el = document.elementFromPoint(t.clientX, t.clientY);
        const cvs = document.getElementById('main-canvas');
        if (el === cvs || cvs?.contains(el)) {
          const pt   = renderer.getCanvasDropPoint(t.clientX, t.clientY);
          const comp = createComponent(lib, pt.x, pt.y);
          state.addComponent(comp);
          const sugs   = generateSuggestions(comp);
          const powerS = sugs.filter(s => ['POWER','GND'].includes(s.netClass));
          acceptAllSuggestions(powerS);
          renderer.suggestions = sugs.filter(s => !['POWER','GND'].includes(s.netClass));
          renderer.render();
          setMsg(`Placed ${comp.partName}`);
        }
      }, { passive: true });

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

// ── Shared helpers ────────────────────────────────────────────────────────────
const mm = (v) => (v * 2.54).toFixed(2);

function updateCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const w    = renderer.screenToWorld(clientX - rect.left, clientY - rect.top);
  document.getElementById('sb-coords').textContent = `X: ${mm(w.x)} mm  Y: ${mm(w.y)} mm`;
  return w;
}

// ── Component drag state ──────────────────────────────────────────────────────
// _drag.comp  : the component being dragged (or null)
// _drag.moved : true once pointer moved > threshold
let _drag = { comp: null, moved: false, startClient: null };

function startCompDrag(comp, clientX, clientY) {
  _drag.comp        = comp;
  _drag.moved       = false;
  _drag.startClient = { x: clientX, y: clientY };
  comp.selected     = true;
  canvas.style.cursor = 'grabbing';
}

function moveCompDrag(clientX, clientY) {
  if (!_drag.comp) return false;
  const rect = canvas.getBoundingClientRect();
  const w    = renderer.screenToWorld(clientX - rect.left, clientY - rect.top);
  const s    = renderer.snap(w.x, w.y);
  _drag.comp.x = s.x;
  _drag.comp.y = s.y;
  _drag.moved  = true;
  renderer.render();
  document.getElementById('sb-coords').textContent = `X: ${mm(s.x)} mm  Y: ${mm(s.y)} mm`;
  return true;
}

function endCompDrag() {
  if (!_drag.comp) return;
  canvas.style.cursor = activeTool ? 'crosshair' : 'default';
  _drag.comp = null;
}

// ── Mouse: pan / drag component / click ──────────────────────────────────────
let _pan = false, _panPt = null;

canvas.addEventListener('mousedown', e => {
  if (e.button === 1 || e.button === 2) {
    _pan = true; _panPt = { x: e.clientX, y: e.clientY };
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;

  // If a placement tool is active, handle as click
  if (activeTool) { handleClick(e); return; }

  // Hit-test for component drag
  const rect  = canvas.getBoundingClientRect();
  const world = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const hit   = hitTest(world.x, world.y);
  if (hit) {
    // Deselect others
    Object.values(state.schematic.components).forEach(c => c.selected = false);
    startCompDrag(hit, e.clientX, e.clientY);
    renderer.render();
  }
  // If no hit, left-click on empty canvas = deselect all on mouseup (handled below)
});

canvas.addEventListener('mousemove', e => {
  const w = updateCoords(e.clientX, e.clientY);

  // Component drag
  if (_drag.comp) {
    moveCompDrag(e.clientX, e.clientY);
    return;
  }

  // Middle/right mouse pan
  if (_pan && _panPt) {
    renderer.pan(e.clientX - _panPt.x, e.clientY - _panPt.y);
    _panPt = { x: e.clientX, y: e.clientY };
  }

  // Wire preview
  if (activeTool === 'wire' && wireTool.active) {
    renderer._wirePreview = { x1: wireTool.startX, y1: wireTool.startY, x2: w.x, y2: w.y };
    renderer.render();
  }

  updateProbeTooltip(e);
});

canvas.addEventListener('mouseup', e => {
  if (_drag.comp) {
    if (!_drag.moved) {
      // Was a click (no movement) → open properties
      onComponentSelect(_drag.comp.partId);
    } else {
      setMsg(`Moved ${_drag.comp.partName} to (${_drag.comp.x.toFixed(0)}, ${_drag.comp.y.toFixed(0)})`);
    }
    endCompDrag();
    renderer.render();
    return;
  }
  if (_pan) { _pan = false; _panPt = null; return; }

  // Click on empty canvas with no tool = deselect all
  if (e.button === 0 && !activeTool) {
    const rect  = canvas.getBoundingClientRect();
    const world = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (!hitTest(world.x, world.y)) {
      Object.values(state.schematic.components).forEach(c => c.selected = false);
      hidePanel();
      renderer.render();
    }
  }
});

// contextmenu handled below (right-click → component context menu)

// ── Touch support ─────────────────────────────────────────────────────────────
let _touch = {
  lastPan: null,
  lastDist: null,
  tapStart: null,
  moved: false,
  compDrag: null,   // component being dragged by touch
};

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t = e.touches[0];
    _touch.lastPan  = { x: t.clientX, y: t.clientY };
    _touch.tapStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    _touch.moved    = false;
    _touch.lastDist = null;
    _touch.compDrag = null;

    if (!activeTool) {
      // Hit-test: maybe start component drag
      const rect  = canvas.getBoundingClientRect();
      const world = renderer.screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
      const hit   = hitTest(world.x, world.y);
      if (hit) {
        Object.values(state.schematic.components).forEach(c => c.selected = false);
        hit.selected    = true;
        _touch.compDrag = hit;
        renderer.render();
      }
    } else if (activeTool === 'wire' && wireTool.active) {
      const rect = canvas.getBoundingClientRect();
      const w    = renderer.screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
      renderer._wirePreview = { x1: wireTool.startX, y1: wireTool.startY, x2: w.x, y2: w.y };
      renderer.render();
    }
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    _touch.lastDist = Math.hypot(dx, dy);
    _touch.lastPan  = null;
    _touch.compDrag = null;
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t    = e.touches[0];
    const dist = Math.hypot(
      t.clientX - (_touch.tapStart?.x ?? t.clientX),
      t.clientY - (_touch.tapStart?.y ?? t.clientY)
    );
    if (dist > 6) _touch.moved = true;

    if (_touch.compDrag && _touch.moved) {
      // Drag component
      moveCompDrag(t.clientX, t.clientY);
    } else if (activeTool === 'wire' && wireTool.active) {
      // Wire preview
      const rect = canvas.getBoundingClientRect();
      const w    = renderer.screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
      renderer._wirePreview = { x1: wireTool.startX, y1: wireTool.startY, x2: w.x, y2: w.y };
      updateCoords(t.clientX, t.clientY);
      renderer.render();
    } else if (_touch.moved && !_touch.compDrag) {
      // Pan canvas
      const dx = t.clientX - (_touch.lastPan?.x ?? t.clientX);
      const dy = t.clientY - (_touch.lastPan?.y ?? t.clientY);
      renderer.pan(dx, dy);
      updateCoords(t.clientX, t.clientY);
    }

    _touch.lastPan = { x: t.clientX, y: t.clientY };

  } else if (e.touches.length === 2) {
    // Pinch zoom
    const dx   = e.touches[0].clientX - e.touches[1].clientX;
    const dy   = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.hypot(dx, dy);
    if (_touch.lastDist) {
      const factor = dist / _touch.lastDist;
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const rect = canvas.getBoundingClientRect();
      renderer.zoomAt(cx - rect.left, cy - rect.top, factor);
      updateZoomDisplay();
    }
    _touch.lastDist = dist;
  }
}, { passive: false });

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  const t  = e.changedTouches[0];
  const dt = Date.now() - (_touch.tapStart?.time ?? 0);

  if (_touch.compDrag) {
    if (!_touch.moved) {
      // Tap on component = open properties
      onComponentSelect(_touch.compDrag.partId);
    } else {
      setMsg(`Moved ${_touch.compDrag.partName}`);
    }
    _touch.compDrag = null;
    endCompDrag();
    renderer.render();
  } else if (!_touch.moved && dt < 350) {
    // Tap on empty canvas = tool action
    handleClick({ clientX: t.clientX, clientY: t.clientY });
  }

  if (e.touches.length === 0) {
    _touch.lastPan  = null;
    _touch.lastDist = null;
  }
}, { passive: false });

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
  hideCtxMenu();
  if (hit) {
    hit.selected = true;
    onComponentSelect(hit.partId);
    showCompActions(hit);
  } else {
    hidePanel();
    hideCompActions();
  }
  renderer.render();
}

function hitTest(wx, wy) {
  // Give small symbols (R/C/LED/power) a generous hit radius of 4 grid units
  // ICs use a wider box (±5 wide, ±8 tall)
  const smallParts = new Set(['R_GENERIC','C_GENERIC','LED_GENERIC','PWR_VCC','PWR_GND']);
  for (const comp of Object.values(state.schematic.components)) {
    const hw = smallParts.has(comp.partId) ? 4 : 5;
    const hh = smallParts.has(comp.partId) ? 4 : 8;
    if (wx > comp.x - hw && wx < comp.x + hw &&
        wy > comp.y - hh && wy < comp.y + hh) return comp;
  }
  return null;
}

// ── Floating action bar ────────────────────────────────────────────────────────
const compActions = document.getElementById('comp-actions');
let _actionTarget = null;   // currently selected component

function showCompActions(comp) {
  _actionTarget = comp;
  document.getElementById('ca-label').textContent = comp.partName;
  positionCompActions(comp);
  compActions.classList.remove('hidden');
}

function positionCompActions(comp) {
  if (!comp) return;
  const s    = renderer.w2s(comp.x, comp.y);
  const wrap = document.getElementById('canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  // Position bar centred above component, 50px above its screen y
  compActions.style.left = `${s.x}px`;
  compActions.style.top  = `${Math.max(8, s.y - 50)}px`;
}

function hideCompActions() {
  _actionTarget = null;
  compActions.classList.add('hidden');
}

function deleteSelected() {
  if (!_actionTarget) return;
  state.removeComponent(_actionTarget.id);
  hideCompActions();
  hidePanel();
  renderer.render();
  setMsg('Component deleted');
}

function rotateSelected() {
  if (!_actionTarget) return;
  _actionTarget.rotation = (_actionTarget.rotation + 90) % 360;
  positionCompActions(_actionTarget);
  renderer.render();
  setMsg(`Rotated to ${_actionTarget.rotation}°`);
}

function mirrorSelected() {
  if (!_actionTarget) return;
  _actionTarget.mirrored = !_actionTarget.mirrored;
  renderer.render();
}

function replaceSelected() {
  if (!_actionTarget) return;
  showReplaceModal(_actionTarget);
}

// Reposition action bar when canvas re-renders (zoom/pan)
const _origRender = renderer.render.bind(renderer);
renderer.render = function() {
  _origRender();
  if (_actionTarget) {
    requestAnimationFrame(() => positionCompActions(_actionTarget));
  }
};

// Wire up action buttons
document.getElementById('ca-delete')?.addEventListener('click',  deleteSelected);
document.getElementById('ca-rotate')?.addEventListener('click',  rotateSelected);
document.getElementById('ca-mirror')?.addEventListener('click',  mirrorSelected);
document.getElementById('ca-replace')?.addEventListener('click', replaceSelected);

// ── Context menu ───────────────────────────────────────────────────────────────
const ctxMenu = document.getElementById('ctx-menu');
let _ctxTarget = null;

function showCtxMenu(comp, screenX, screenY) {
  _ctxTarget = comp;
  // Set title to component name
  const title = document.getElementById('ctx-comp-name');
  if (title) title.textContent = comp.partName + (comp.value ? ` (${comp.value})` : '');
  // Ensure menu stays within viewport
  ctxMenu.classList.remove('hidden');
  const mw = ctxMenu.offsetWidth  || 180;
  const mh = ctxMenu.offsetHeight || 200;
  const vw = window.innerWidth, vh = window.innerHeight;
  ctxMenu.style.left = `${Math.min(screenX, vw - mw - 8)}px`;
  ctxMenu.style.top  = `${Math.min(screenY, vh - mh - 8)}px`;
}

function hideCtxMenu() {
  ctxMenu.classList.add('hidden');
  _ctxTarget = null;
}

document.getElementById('ctx-delete')?.addEventListener('click', () => {
  _actionTarget = _ctxTarget; deleteSelected(); hideCtxMenu();
});
document.getElementById('ctx-rotate')?.addEventListener('click', () => {
  _actionTarget = _ctxTarget; rotateSelected(); hideCtxMenu();
});
document.getElementById('ctx-mirror')?.addEventListener('click', () => {
  _actionTarget = _ctxTarget; mirrorSelected(); hideCtxMenu();
});
document.getElementById('ctx-replace')?.addEventListener('click', () => {
  _actionTarget = _ctxTarget; replaceSelected(); hideCtxMenu();
});
document.getElementById('ctx-properties')?.addEventListener('click', () => {
  if (_ctxTarget) { onComponentSelect(_ctxTarget.partId); showCompActions(_ctxTarget); }
  hideCtxMenu();
});
document.getElementById('ctx-connections')?.addEventListener('click', () => {
  if (!_ctxTarget) { hideCtxMenu(); return; }
  const comp  = _ctxTarget;
  const nets  = comp.pins.filter(p => p.netId).map(p => `${p.name}: ${p.netId}`);
  const msg   = nets.length ? nets.join(', ') : 'No connected nets';
  setMsg(`${comp.partName} connections — ${msg}`);
  hideCtxMenu();
});

// Close context menu on click or touch outside
function _dismissMenus(e) {
  if (!ctxMenu.contains(e.target)) hideCtxMenu();
}
document.addEventListener('click',      _dismissMenus);
document.addEventListener('touchstart', _dismissMenus, { passive: true });

// Right-click on canvas → context menu
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const rect  = canvas.getBoundingClientRect();
  const world = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const hit   = hitTest(world.x, world.y);
  if (hit) {
    Object.values(state.schematic.components).forEach(c => c.selected = false);
    hit.selected = true;
    showCompActions(hit);
    showCtxMenu(hit, e.clientX, e.clientY);
    renderer.render();
  }
});

// Long-press on canvas → context menu (touch)
let _longPressTimer = null;
canvas.addEventListener('touchstart', e2 => {
  if (e2.touches.length !== 1) return;
  const t = e2.touches[0];
  _longPressTimer = setTimeout(() => {
    const rect  = canvas.getBoundingClientRect();
    const world = renderer.screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
    const hit   = hitTest(world.x, world.y);
    if (hit) {
      Object.values(state.schematic.components).forEach(c => c.selected = false);
      hit.selected = true;
      showCompActions(hit);
      showCtxMenu(hit, t.clientX, t.clientY);
      renderer.render();
    }
  }, 500);
}, { passive: true });

canvas.addEventListener('touchmove',  () => { clearTimeout(_longPressTimer); }, { passive: true });
canvas.addEventListener('touchend',   () => { clearTimeout(_longPressTimer); }, { passive: true });

// ── Replace modal ─────────────────────────────────────────────────────────────
function showReplaceModal(comp) {
  // Reuse component list as a modal picker
  let modal = document.getElementById('replace-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'replace-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-box" style="min-width:320px;max-height:70vh;overflow:hidden;display:flex;flex-direction:column;">
        <div class="modal-hdr">Replace Component
          <button id="replace-close" class="icon-btn">✕</button>
        </div>
        <div style="padding:8px;">
          <div class="lib-search-wrap">
            <svg class="lib-search-icon" viewBox="0 0 16 16"><circle cx="6.5" cy="6.5" r="4" stroke="currentColor" fill="none" stroke-width="1.3"/><path d="M10 10l3 3" stroke="currentColor" stroke-width="1.5"/></svg>
            <input id="replace-search" type="text" placeholder="Search…" autocomplete="off" style="flex:1;background:none;border:none;outline:none;color:var(--text);font-size:12px;padding:5px 4px;"/>
          </div>
        </div>
        <div id="replace-list" style="flex:1;overflow-y:auto;padding:4px;"></div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('replace-close').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
    document.getElementById('replace-search').addEventListener('input', () => buildReplaceList(comp));
  }
  modal._targetComp = comp;
  modal.classList.remove('hidden');
  buildReplaceList(comp);
}

function buildReplaceList(comp) {
  const modal  = document.getElementById('replace-modal');
  const list   = document.getElementById('replace-list');
  const query  = document.getElementById('replace-search')?.value.toLowerCase() ?? '';
  if (!list) return;
  list.innerHTML = '';
  const filtered = COMPONENT_LIBRARY.filter(c =>
    c.partName.toLowerCase().includes(query) || c.category.toLowerCase().includes(query)
  );
  for (const lib of filtered) {
    const div = document.createElement('div');
    div.className = 'comp-item';
    div.style.cursor = 'pointer';
    div.innerHTML = `<div class="comp-info"><div class="comp-name">${lib.partName}</div><div class="comp-cat">${lib.category} · ${lib.footprintId ?? '—'}</div></div>`;
    div.addEventListener('click', () => {
      // Swap the component in place, keep position/rotation
      const target = modal._targetComp;
      const newComp = createComponent(lib, target.x, target.y);
      newComp.rotation = target.rotation;
      newComp.selected = true;
      state.removeComponent(target.id);
      state.addComponent(newComp);
      showCompActions(newComp);
      onComponentSelect(newComp.partId);
      renderer.render();
      modal.classList.add('hidden');
      setMsg(`Replaced with ${lib.partName}`);
    });
    list.appendChild(div);
  }
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
      hideCompActions();
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
