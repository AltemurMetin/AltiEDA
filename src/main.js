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
import { applyTheme } from './core/canvasRenderer.js';
import { runDRC, renderDRCPanel, calculateMicrostripImpedance, calculateDifferentialImpedance, suggestTraceWidth } from './tools/drcEngine.js';
import { exportManufacturingPackage }      from './export/exportPackager.js';
import { onComponentSelect, initPanel, hidePanel } from './ui/contextualPanel.js';
import { toggle2D3DView, renderLayerStackupUI }     from './ui/threeDView.js';
import { runSimulation, initSimulationManager }     from './simulation/simulationManager.js';
import { plotACResponse, plotDCSweep, showOscilloscope } from './simulation/oscilloscope.js';
import { autoRoute, createCopperPour, clearCopperPours } from './tools/autoRouter.js';
import { computeACResponse, computeDCSweep, computeNoiseAnalysis } from './simulation/acAnalysis.js';
import { exportSchematicPDF, HierarchicalSchematic } from './export/pdfExport.js';

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
          state.pushUndo();
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
  const s = '#4ec9b0';  // standard stroke color
  const icons = {
    // ── Passives ──
    R_GENERIC:  `<svg viewBox="-40 -12 80 24" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round"><line x1="-36" y1="0" x2="-20" y2="0"/><line x1="20" y1="0" x2="36" y2="0"/><rect x="-20" y="-7" width="40" height="14" rx="2" fill="#d2b48c" stroke="#8B7355" stroke-width="1.2"/><rect x="-12" y="-6" width="3" height="12" fill="#8B4513"/><rect x="-4" y="-6" width="3" height="12" fill="#000"/><rect x="4" y="-6" width="3" height="12" fill="#FF8C00"/><rect x="12" y="-6" width="3" height="12" fill="#CFB53B"/></svg>`,
    C_GENERIC:  `<svg viewBox="-32 -16 64 32" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round"><line x1="-28" y1="0" x2="-5" y2="0"/><line x1="5" y1="0" x2="28" y2="0"/><line x1="-5" y1="-14" x2="-5" y2="14"/><line x1="5" y1="-14" x2="5" y2="14"/></svg>`,
    L_GENERIC:  `<svg viewBox="-40 -12 80 24" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round"><line x1="-36" y1="0" x2="-24" y2="0"/><path d="M-24,0 A6,6 0 0,1 -12,0 A6,6 0 0,1 0,0 A6,6 0 0,1 12,0 A6,6 0 0,1 24,0" /><line x1="24" y1="0" x2="36" y2="0"/></svg>`,
    LED_GENERIC:`<svg viewBox="-36 -18 72 36" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="-32" y1="0" x2="-12" y2="0"/><polygon points="-12,-12 -12,12 12,0" fill="rgba(78,201,176,0.2)"/><line x1="12" y1="-12" x2="12" y2="12"/><line x1="12" y1="0" x2="32" y2="0"/><line x1="6" y1="-14" x2="12" y2="-20" stroke="#dcdcaa"/><line x1="12" y1="-14" x2="18" y2="-20" stroke="#dcdcaa"/></svg>`,
    // ── Diodes ──
    D_1N4007:   `<svg viewBox="-36 -16 72 32" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="-32" y1="0" x2="-12" y2="0"/><polygon points="-12,-12 -12,12 12,0" fill="rgba(78,201,176,0.2)"/><line x1="12" y1="-12" x2="12" y2="12"/><line x1="12" y1="0" x2="32" y2="0"/></svg>`,
    D_ZENER:    `<svg viewBox="-36 -18 72 36" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="-32" y1="0" x2="-12" y2="0"/><polygon points="-12,-12 -12,12 12,0" fill="rgba(78,201,176,0.2)"/><line x1="12" y1="-12" x2="12" y2="12"/><line x1="12" y1="-12" x2="7" y2="-17"/><line x1="12" y1="12" x2="17" y2="17"/><line x1="12" y1="0" x2="32" y2="0"/></svg>`,
    D_SCHOTTKY: `<svg viewBox="-36 -18 72 36" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="-32" y1="0" x2="-12" y2="0"/><polygon points="-12,-12 -12,12 12,0" fill="rgba(78,201,176,0.2)"/><line x1="12" y1="-12" x2="12" y2="12"/><path d="M8,-12 L12,-12 L12,12 L16,12" fill="none"/><line x1="12" y1="0" x2="32" y2="0"/></svg>`,
    // ── Transistors ──
    Q_NPN_BC547:`<svg viewBox="-28 -24 56 48" stroke="#dcdcaa" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="0" r="16" fill="rgba(220,220,170,0.12)"/><line x1="-22" y1="0" x2="-8" y2="0"/><line x1="-8" y1="-12" x2="-8" y2="12" stroke-width="2.5"/><line x1="-8" y1="-6" x2="12" y2="-18"/><line x1="-8" y1="6" x2="12" y2="18"/><polygon points="12,18 5,14 8,10" fill="#dcdcaa"/></svg>`,
    Q_PNP_BC557:`<svg viewBox="-28 -24 56 48" stroke="#dcdcaa" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="0" r="16" fill="rgba(220,220,170,0.12)"/><line x1="-22" y1="0" x2="-8" y2="0"/><line x1="-8" y1="-12" x2="-8" y2="12" stroke-width="2.5"/><line x1="-8" y1="-6" x2="12" y2="-18"/><line x1="-8" y1="6" x2="12" y2="18"/><polygon points="-8,6 -1,4 -2,10" fill="#dcdcaa"/></svg>`,
    Q_NMOS_2N7000:`<svg viewBox="-30 -24 60 48" stroke="#dcdcaa" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="0" r="16" fill="rgba(220,220,170,0.12)"/><line x1="-26" y1="0" x2="-12" y2="0"/><line x1="-12" y1="-10" x2="-12" y2="10" stroke-width="2.5"/><line x1="-8" y1="-10" x2="-8" y2="-4"/><line x1="-8" y1="-1" x2="-8" y2="1"/><line x1="-8" y1="4" x2="-8" y2="10"/><line x1="-8" y1="-10" x2="12" y2="-18"/><line x1="-8" y1="10" x2="12" y2="18"/><polygon points="-12,0 -17,-3 -17,3" fill="#dcdcaa"/></svg>`,
    // ── Misc Passives ──
    BTN_TACT:   `<svg viewBox="-32 -16 64 32" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round"><line x1="-28" y1="-8" x2="-12" y2="-8"/><line x1="-28" y1="8" x2="-12" y2="8"/><line x1="12" y1="-8" x2="28" y2="-8"/><line x1="12" y1="8" x2="28" y2="8"/><line x1="-12" y1="-12" x2="-12" y2="12"/><line x1="12" y1="-12" x2="12" y2="12"/><line x1="-12" y1="0" x2="12" y2="0" stroke-dasharray="3,3"/></svg>`,
    CRYSTAL:    `<svg viewBox="-28 -16 56 32" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round"><line x1="-24" y1="0" x2="-8" y2="0"/><line x1="8" y1="0" x2="24" y2="0"/><rect x="-8" y="-12" width="16" height="24" rx="1"/><line x1="-3" y1="-12" x2="-3" y2="12" stroke-width="2.5"/><line x1="3" y1="-12" x2="3" y2="12" stroke-width="2.5"/></svg>`,
    BUZZER:     `<svg viewBox="-24 -16 48 32" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round"><circle cx="0" cy="0" r="14" fill="rgba(78,201,176,0.1)"/><line x1="-22" y1="0" x2="-14" y2="0"/><line x1="14" y1="0" x2="22" y2="0"/><text x="0" y="4" text-anchor="middle" fill="${s}" font-size="10" font-family="monospace" stroke="none">~</text></svg>`,
    // ── Power ──
    PWR_VCC:    `<svg viewBox="-16 -20 32 36" stroke="#f44747" fill="none" stroke-width="2"><line x1="0" y1="14" x2="0" y2="-4"/><polygon points="0,-16 -10,-4 10,-4" fill="rgba(244,71,71,0.25)" stroke="#f44747"/></svg>`,
    PWR_GND:    `<svg viewBox="-18 -10 36 32" stroke="#6a9955" fill="none" stroke-width="2"><line x1="0" y1="-8" x2="0" y2="4"/><line x1="-16" y1="4" x2="16" y2="4"/><line x1="-10" y1="10" x2="10" y2="10"/><line x1="-4" y1="16" x2="4" y2="16"/></svg>`,
    LM7805:     `<svg viewBox="-24 -16 48 32" stroke="${s}" fill="none" stroke-width="1.5" stroke-linecap="round"><rect x="-16" y="-12" width="32" height="24" rx="2" fill="rgba(78,201,176,0.08)"/><text x="0" y="2" text-anchor="middle" fill="${s}" font-size="8" font-family="monospace" stroke="none">7805</text><line x1="-24" y1="0" x2="-16" y2="0"/><line x1="16" y1="0" x2="24" y2="0"/><line x1="0" y1="12" x2="0" y2="18"/></svg>`,
    LM317:      `<svg viewBox="-24 -16 48 32" stroke="${s}" fill="none" stroke-width="1.5" stroke-linecap="round"><rect x="-16" y="-12" width="32" height="24" rx="2" fill="rgba(78,201,176,0.08)"/><text x="0" y="2" text-anchor="middle" fill="${s}" font-size="8" font-family="monospace" stroke="none">317</text><line x1="-24" y1="0" x2="-16" y2="0"/><line x1="16" y1="0" x2="24" y2="0"/><line x1="0" y1="12" x2="0" y2="18"/></svg>`,
    AMS1117_3V3:`<svg viewBox="-24 -16 48 32" stroke="${s}" fill="none" stroke-width="1.5" stroke-linecap="round"><rect x="-16" y="-12" width="32" height="24" rx="2" fill="rgba(78,201,176,0.08)"/><text x="0" y="2" text-anchor="middle" fill="${s}" font-size="7" font-family="monospace" stroke="none">1117</text><line x1="-24" y1="0" x2="-16" y2="0"/><line x1="16" y1="0" x2="24" y2="0"/></svg>`,
    // ── Sensors ──
    LDR:        `<svg viewBox="-28 -14 56 28" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round"><line x1="-24" y1="0" x2="-14" y2="0"/><polyline points="-14,0 -10,-6 -2,6 6,-6 14,6 18,0"/><line x1="18" y1="0" x2="24" y2="0"/><line x1="-4" y1="-10" x2="2" y2="-16" stroke="#dcdcaa" stroke-width="1.5"/><line x1="4" y1="-10" x2="10" y2="-16" stroke="#dcdcaa" stroke-width="1.5"/></svg>`,
    NTC_10K:    `<svg viewBox="-28 -14 56 28" stroke="${s}" fill="none" stroke-width="2" stroke-linecap="round"><line x1="-24" y1="0" x2="-14" y2="0"/><rect x="-14" y="-8" width="28" height="16" rx="1"/><line x1="14" y1="0" x2="24" y2="0"/><text x="0" y="4" text-anchor="middle" fill="${s}" font-size="9" font-family="monospace" stroke="none">t</text></svg>`,
    // ── Connectors ──
    CONN_2PIN:  `<svg viewBox="-20 -14 40 28" stroke="${s}" fill="none" stroke-width="1.5"><rect x="-10" y="-12" width="20" height="24" rx="2" fill="rgba(78,201,176,0.08)"/><circle cx="0" cy="-5" r="3" fill="${s}"/><circle cx="0" cy="5" r="3" fill="${s}"/></svg>`,
    CONN_3PIN:  `<svg viewBox="-20 -18 40 36" stroke="${s}" fill="none" stroke-width="1.5"><rect x="-10" y="-16" width="20" height="32" rx="2" fill="rgba(78,201,176,0.08)"/><circle cx="0" cy="-8" r="3" fill="${s}"/><circle cx="0" cy="0" r="3" fill="${s}"/><circle cx="0" cy="8" r="3" fill="${s}"/></svg>`,
    CONN_4PIN:  `<svg viewBox="-20 -22 40 44" stroke="${s}" fill="none" stroke-width="1.5"><rect x="-10" y="-20" width="20" height="40" rx="2" fill="rgba(78,201,176,0.08)"/><circle cx="0" cy="-12" r="3" fill="${s}"/><circle cx="0" cy="-4" r="3" fill="${s}"/><circle cx="0" cy="4" r="3" fill="${s}"/><circle cx="0" cy="12" r="3" fill="${s}"/></svg>`,
    CONN_USB_MICRO:`<svg viewBox="-20 -16 40 32" stroke="${s}" fill="none" stroke-width="1.5"><path d="M-12,-14 L12,-14 L16,-6 L16,14 L-16,14 L-16,-6 Z" fill="rgba(78,201,176,0.08)"/><rect x="-6" y="-2" width="12" height="8" rx="1"/></svg>`,
  };
  // For MCUs, Sensors, Displays, Drivers: generate IC-style icon with label
  const icParts = {
    ESP32_WROOM: 'ESP32', ARDUINO_UNO: 'UNO', ARDUINO_NANO: 'NANO', ARDUINO_MEGA: 'MEGA',
    ESP8266_12F: '8266', STM32F103C8: 'STM32', ATTINY85: 'T85', RPIPICO: 'PICO',
    ATMEGA328P: '328P', BME280: 'BME', DHT22: 'DHT', HC_SR04: 'SR04', MPU6050: 'MPU',
    DS18B20: 'DS18', PIR_HCSR501: 'PIR', SSD1306_OLED: 'OLED', LCD_1602: 'LCD',
    L293D: 'L293', ULN2003: 'ULN',
    LM358: 'LM358', NE555: '555', CD4017: '4017', SHIFT_74HC595: '595',
    NRF24L01: 'nRF24', MCP2515: 'CAN', MAX4466: 'MIC',
    RELAY_SPDT: 'RELAY', SERVO_SG90: 'SERVO',
    AT24C256: 'EPRM', W25Q128: 'FLASH',
  };
  if (icons[partId]) return icons[partId];
  if (icParts[partId]) {
    const label = icParts[partId];
    return `<svg viewBox="-24 -18 48 36" stroke="#569cd6" fill="none" stroke-width="1.5"><rect x="-20" y="-16" width="40" height="32" rx="2" fill="rgba(86,156,214,0.1)"/><line x1="-20" y1="-8" x2="-24" y2="-8"/><line x1="-20" y1="0" x2="-24" y2="0"/><line x1="-20" y1="8" x2="-24" y2="8"/><line x1="20" y1="-8" x2="24" y2="-8"/><line x1="20" y1="0" x2="24" y2="0"/><line x1="20" y1="8" x2="24" y2="8"/><text x="0" y="3" text-anchor="middle" fill="#569cd6" font-size="8" font-family="monospace" stroke="none">${label}</text></svg>`;
  }
  return `<svg viewBox="-24 -18 48 36" stroke="#569cd6" fill="none" stroke-width="1.5"><rect x="-20" y="-16" width="40" height="32" rx="2" fill="rgba(86,156,214,0.1)"/><line x1="-20" y1="-6" x2="-24" y2="-6"/><line x1="-20" y1="6" x2="-24" y2="6"/><line x1="20" y1="-6" x2="24" y2="-6"/><line x1="20" y1="6" x2="24" y2="6"/></svg>`;
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
  state.pushUndo();
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

/** Parse component value string (e.g. "10kΩ" → 10000, "5.1V" → 5.1) */
function parseComponentValue(s) {
  if (!s) return 0;
  const m = s.trim().match(/^([+-]?[\d.eE+-]+)\s*([a-zA-ZΩµ]*)/);
  if (!m) return 0;
  let v = parseFloat(m[1]);
  let suffix = m[2].replace(/[ΩFHVAohm]/gi, '').replace('µ', 'u').toLowerCase();
  const mults = { 'f':1e-15, 'p':1e-12, 'n':1e-9, 'u':1e-6,
                  'm':1e-3, 'k':1e3, 'meg':1e6, 'g':1e9, 't':1e12 };
  if (mults[suffix]) v *= mults[suffix];
  return v || 0;
}

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
  state.pushUndo();
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
    Object.values(state.schematic.wires).forEach(w => { w.selected = false; });
    Object.values(state.pcb.vias).forEach(v => { v.selected = false; });
    _selectedWireId = null;
    _selectedViaId  = null;
    startCompDrag(hit, e.clientX, e.clientY);
    renderer.render();
  }
  // If no component hit, check wire/via selection (no tool needed)
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

  // Wire preview (L-shape)
  if (activeTool === 'wire' && wireTool.active) {
    wireTool.preview(w.x, w.y);          // updates wireTool._previewWire
    renderer._wirePreview = wireTool._previewWire;
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

  // Click on canvas with no tool = try to select wire/via, or deselect all
  if (e.button === 0 && !activeTool) {
    const rect  = canvas.getBoundingClientRect();
    const world = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    if (!hitTest(world.x, world.y)) {
      // Deselect everything first
      Object.values(state.schematic.components).forEach(c => c.selected = false);
      Object.values(state.schematic.wires).forEach(w => { w.selected = false; });
      Object.values(state.pcb.vias).forEach(v => { v.selected = false; });
      _selectedWireId = null;
      _selectedViaId  = null;
      hideCompActions();

      // Try wire hit
      const wireHit = renderer.wireHitTest(world.x, world.y);
      if (wireHit) {
        wireHit.selected = true;
        _selectedWireId  = wireHit.id;
        setMsg('Wire selected — Del to delete, ESC to deselect');
      } else {
        // Try via hit
        const viaHit = renderer.viaHitTest(world.x, world.y);
        if (viaHit) {
          viaHit.selected = true;
          _selectedViaId  = viaHit.id;
          setMsg('Via selected — Del to delete, ESC to deselect');
        } else {
          hidePanel();
        }
      }
      renderer.render();
    }
  }
});

// contextmenu handled below (right-click → component context menu)

// ── Touch support ─────────────────────────────────────────────────────────────
let _touch = {
  lastPan: null,
  lastDist: null,
  wireDrag: false,
  tapStart: null,
  moved: false,
  compDrag: null,   // component being dragged by touch
};

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t    = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const w    = renderer.screenToWorld(t.clientX - rect.left, t.clientY - rect.top);

    _touch.lastPan  = { x: t.clientX, y: t.clientY };
    _touch.tapStart = { x: t.clientX, y: t.clientY, time: Date.now() };
    _touch.moved    = false;
    _touch.lastDist = null;
    _touch.compDrag = null;
    _touch.wireDrag = false;

    if (activeTool === 'wire') {
      // Try to start / continue wire by touch — begin() will snap to nearest pin
      const err = wireTool.active ? null : wireTool.begin(w.x, w.y);
      if (err) {
        // No pin near touch-down: just show message, don't start drag
        setMsg(err.error, true);
      } else if (wireTool.active) {
        _touch.wireDrag = true;
        wireTool.preview(w.x, w.y);
        renderer._wirePreview = wireTool._previewWire;
        renderer.render();
      }
    } else if (!activeTool) {
      // Hit-test: maybe start component drag
      const hit = hitTest(w.x, w.y);
      if (hit) {
        Object.values(state.schematic.components).forEach(c => c.selected = false);
        hit.selected    = true;
        _touch.compDrag = hit;
        renderer.render();
      }
    }
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    _touch.lastDist = Math.hypot(dx, dy);
    _touch.lastPan  = null;
    _touch.compDrag = null;
    _touch.wireDrag = false;
    // Cancel wire drag on 2-finger
    if (wireTool.active) { wireTool.end(); renderer._wirePreview = null; }
  }
}, { passive: false });

canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 1) {
    const t    = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const w    = renderer.screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
    const dist = Math.hypot(
      t.clientX - (_touch.tapStart?.x ?? t.clientX),
      t.clientY - (_touch.tapStart?.y ?? t.clientY)
    );
    if (dist > 6) _touch.moved = true;

    if (_touch.wireDrag && wireTool.active) {
      // L-shape wire preview follows finger
      wireTool.preview(w.x, w.y);
      renderer._wirePreview = wireTool._previewWire;
      updateCoords(t.clientX, t.clientY);
      renderer.render();
    } else if (_touch.compDrag && _touch.moved) {
      moveCompDrag(t.clientX, t.clientY);
    } else if (_touch.moved && !_touch.compDrag) {
      const dx = t.clientX - (_touch.lastPan?.x ?? t.clientX);
      const dy = t.clientY - (_touch.lastPan?.y ?? t.clientY);
      renderer.pan(dx, dy);
      updateCoords(t.clientX, t.clientY);
    }

    _touch.lastPan = { x: t.clientX, y: t.clientY };

  } else if (e.touches.length === 2) {
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
  const rect = canvas.getBoundingClientRect();
  const w    = renderer.screenToWorld(t.clientX - rect.left, t.clientY - rect.top);

  if (_touch.wireDrag && wireTool.active) {
    // Finger lifted: try to commit wire at current position
    const result = wireTool.commit(w.x, w.y);
    renderer._wirePreview = null;
    _touch.wireDrag = false;
    if (result?.error) {
      setMsg(result.error, true);
      wireTool.end();            // cancel — user can start fresh
    } else if (Array.isArray(result) && result.length > 0) {
      setMsg('Wire placed — tap next pin or ESC to stop');
      // Keep wire active for chaining: update preview at lifted position
      wireTool.preview(w.x, w.y);
      renderer._wirePreview = null;  // clear until next touch
      renderer.render();
    }
  } else if (_touch.compDrag) {
    if (!_touch.moved) onComponentSelect(_touch.compDrag.partId);
    else setMsg(`Moved ${_touch.compDrag.partName}`);
    _touch.compDrag = null;
    endCompDrag();
    renderer.render();
  } else if (!_touch.moved && dt < 350) {
    if (activeTool === 'wire' && wireTool.active) {
      // Short tap while wire is started: try to commit
      const result = wireTool.commit(w.x, w.y);
      renderer._wirePreview = null;
      if (result?.error) setMsg(result.error, true);
      else if (Array.isArray(result) && result.length > 0) {
        setMsg('Wire placed — tap next pin or ESC to stop');
      }
      renderer.render();
    } else {
      // Regular tap: tool action
      handleClick({ clientX: t.clientX, clientY: t.clientY });
    }
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
      const err = wireTool.begin(world.x, world.y);
      if (err) setMsg(err.error, true);
      else setMsg('Click on a pin to end the wire — ESC to cancel');
    } else {
      const result = wireTool.commit(world.x, world.y);
      if (result?.error) {
        setMsg(result.error, true);
      } else if (Array.isArray(result) && result.length > 0) {
        renderer._wirePreview = null;
        setMsg('Wire placed — click next pin or ESC to stop');
      }
    }
    renderer.render(); return;
  }

  if (activeTool === 'via') {
    placeVia(world.x, world.y, 'F.Cu', 'B.Cu', renderer);
    renderer.render(); return;
  }

  if (activeTool === 'probe' || activeTool === 'probe-v') {
    const probe = placeProbeTool(world.x, world.y, 'voltage', renderer);
    setMsg(`Voltage probe on net: ${probe.netName ?? '(unconnected)'}`);
    renderer.render(); return;
  }

  if (activeTool === 'probe-a') {
    const probe = placeProbeTool(world.x, world.y, 'current', renderer);
    setMsg(`Current probe on net: ${probe.netName ?? '(unconnected)'}`);
    renderer.render(); return;
  }

  // Selection
  const hit = hitTest(world.x, world.y);
  Object.values(state.schematic.components).forEach(c => c.selected = false);
  Object.values(state.pcb.vias).forEach(v => { v.selected = false; });
  hideCtxMenu();
  // Deselect all wires first
  Object.values(state.schematic.wires).forEach(w => { w.selected = false; });

  if (hit) {
    hit.selected = true;
    _selectedWireId = null;
    _selectedViaId  = null;
    onComponentSelect(hit.partId);
    showCompActions(hit);
  } else {
    // Check wire hit
    const wireHit = renderer.wireHitTest(world.x, world.y);
    if (wireHit) {
      wireHit.selected = true;
      _selectedWireId  = wireHit.id;
      _selectedViaId   = null;
      setMsg('Wire selected — Del to delete, ESC to deselect');
    } else {
      // Check via hit
      const viaHit = renderer.viaHitTest(world.x, world.y);
      if (viaHit) {
        viaHit.selected = true;
        _selectedViaId  = viaHit.id;
        _selectedWireId = null;
        setMsg('Via selected — Del to delete, ESC to deselect');
      } else {
        _selectedWireId = null;
        _selectedViaId  = null;
        hidePanel();
        hideCompActions();
      }
    }
  }
  renderer.render();
}

let _selectedWireId = null;
let _selectedViaId  = null;

function hitTest(wx, wy) {
  // Give small symbols (R/C/LED/power) a generous hit radius of 4 grid units
  // ICs use a wider box (±5 wide, ±8 tall)
  const smallParts = new Set(['R_GENERIC','C_GENERIC','LED_GENERIC','L_GENERIC','PWR_VCC','PWR_GND']);
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

const EDITABLE_PARTS = new Set([
  'R_GENERIC','C_GENERIC','LED_GENERIC','L_GENERIC',
  'D_1N4007','D_ZENER','D_SCHOTTKY',
  'Q_NPN_BC547','Q_PNP_BC557','Q_NMOS_2N7000',
  'PWR_VCC','PWR_GND','LM7805','LM317','AMS1117_3V3',
  'LDR','NTC_10K','BUZZER','CRYSTAL',
]);
// Keep backward compat alias
const PASSIVE_PARTS = EDITABLE_PARTS;

function showCompActions(comp) {
  _actionTarget = comp;
  document.getElementById('ca-label').textContent = comp.partName;
  // Show "Edit Value" button only for passives
  const caValue = document.getElementById('ca-value');
  if (caValue) {
    if (PASSIVE_PARTS.has(comp.partId)) caValue.classList.remove('hidden');
    else caValue.classList.add('hidden');
  }
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
  state.pushUndo();
  state.removeComponent(_actionTarget.id);
  hideCompActions();
  hidePanel();
  renderer.render();
  setMsg('Component deleted');
}

function rotateSelected() {
  if (!_actionTarget) return;
  state.pushUndo();
  _actionTarget.rotation = (_actionTarget.rotation + 90) % 360;
  positionCompActions(_actionTarget);
  renderer.render();
  setMsg(`Rotated to ${_actionTarget.rotation}°`);
}

function mirrorSelected() {
  if (!_actionTarget) return;
  state.pushUndo();
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
document.getElementById('ca-value')?.addEventListener('click', () => {
  if (_actionTarget) showValueModal(_actionTarget);
});

// ── Value edit modal ───────────────────────────────────────────────────────────
const VALUE_HINTS = {
  R_GENERIC:     ['1Ω','10Ω','100Ω','220Ω','470Ω','1kΩ','4.7kΩ','10kΩ','47kΩ','100kΩ','1MΩ'],
  C_GENERIC:     ['1pF','10pF','100pF','1nF','10nF','100nF','1µF','10µF','100µF','1000µF'],
  L_GENERIC:     ['1nH','10nH','100nH','1µH','10µH','100µH','1mH','10mH','100mH'],
  LED_GENERIC:   ['RED','GREEN','BLUE','WHITE','YELLOW','IR','UV'],
  D_ZENER:       ['3.3V','4.7V','5.1V','5.6V','6.2V','9.1V','12V','15V','24V'],
  PWR_VCC:       ['1.8V','2.5V','3.3V','5V','9V','12V','24V','48V'],
  PWR_GND:       ['0V'],
  LDR:           ['1kΩ','5kΩ','10kΩ','50kΩ','100kΩ'],
  NTC_10K:       ['1kΩ','5kΩ','10kΩ','47kΩ','100kΩ'],
  CRYSTAL:       ['4MHz','8MHz','12MHz','16MHz','20MHz','25MHz','32.768kHz'],
  BUZZER:        ['3.3V','5V','9V','12V'],
};

function showValueModal(comp) {
  let modal = document.getElementById('value-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'value-modal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-box" style="min-width:300px;">
        <div class="modal-hdr">
          Edit Value
          <button id="vm-close" class="icon-btn">✕</button>
        </div>
        <div style="padding:16px 16px 8px;">
          <div id="vm-compname" style="color:var(--text2);font-size:11px;margin-bottom:10px;"></div>
          <input id="vm-input" type="text"
            style="width:100%;background:var(--bg3);border:1px solid var(--border2);
                   color:var(--text);font-size:14px;padding:7px 10px;border-radius:3px;
                   outline:none;font-family:monospace;"/>
          <div id="vm-hints" style="display:flex;flex-wrap:wrap;gap:4px;margin-top:10px;"></div>
        </div>
        <div style="padding:8px 16px 14px;display:flex;gap:8px;justify-content:flex-end;">
          <button id="vm-cancel" style="padding:5px 14px;background:var(--bg3);border:1px solid var(--border);
            color:var(--text);border-radius:3px;cursor:pointer;font-size:12px;">Cancel</button>
          <button id="vm-ok" style="padding:5px 14px;background:var(--accent);border:none;
            color:#000;border-radius:3px;cursor:pointer;font-size:12px;font-weight:600;">OK</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('vm-close').addEventListener('click',  () => modal.classList.add('hidden'));
    document.getElementById('vm-cancel').addEventListener('click', () => modal.classList.add('hidden'));
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
    document.getElementById('vm-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('vm-ok').click();
      if (e.key === 'Escape') modal.classList.add('hidden');
    });
    document.getElementById('vm-ok').addEventListener('click', () => {
      const val = document.getElementById('vm-input').value.trim();
      if (modal._targetComp && val !== '') {
        state.pushUndo();
        const comp = modal._targetComp;
        comp.value = val;

        // Update SPICE model directive when value changes
        if (comp.spiceModel) {
          const numVal = parseComponentValue(val);
          switch (comp.partId) {
            case 'PWR_VCC':
              comp.spiceModel.directive = `DC ${numVal}`;
              break;
            case 'D_ZENER':
              comp.spiceModel.directive = `.model DZENER D(Is=1e-10 BV=${numVal})`;
              break;
            case 'LM7805':
            case 'LM317':
            case 'AMS1117_3V3':
              // Voltage regulator output voltage hint
              break;
          }
        }

        renderer.render();
        setMsg(`Value set to ${val}`);
      }
      modal.classList.add('hidden');
    });
  }

  modal._targetComp = comp;
  document.getElementById('vm-compname').textContent = `${comp.partName}  ·  current: ${comp.value || '—'}`;
  const input = document.getElementById('vm-input');
  input.value = comp.value || '';

  // Render hint chips
  const hintsEl = document.getElementById('vm-hints');
  hintsEl.innerHTML = '';
  (VALUE_HINTS[comp.partId] ?? []).forEach(h => {
    const chip = document.createElement('button');
    chip.textContent = h;
    chip.style.cssText = 'padding:3px 8px;background:var(--bg4);border:1px solid var(--border);' +
      'color:var(--text2);border-radius:3px;cursor:pointer;font-size:11px;font-family:monospace;';
    chip.addEventListener('click', () => { input.value = h; input.focus(); });
    hintsEl.appendChild(chip);
  });

  modal.classList.remove('hidden');
  requestAnimationFrame(() => { input.select(); input.focus(); });
}

// Double-click on canvas → open value modal for passives
canvas.addEventListener('dblclick', e => {
  const rect  = canvas.getBoundingClientRect();
  const world = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const hit   = hitTest(world.x, world.y);
  if (hit && PASSIVE_PARTS.has(hit.partId)) showValueModal(hit);
});

// ── Context menu ───────────────────────────────────────────────────────────────
const ctxMenu = document.getElementById('ctx-menu');
let _ctxTarget = null;   // { type: 'comp'|'wire'|'via', obj: ... }

function showCtxMenu(target, screenX, screenY) {
  _ctxTarget = target;
  const title = document.getElementById('ctx-comp-name');
  const selectNetBtn = document.getElementById('ctx-select-net');

  // Remove previous type classes
  ctxMenu.classList.remove('ctx-type-comp', 'ctx-type-wire', 'ctx-type-via');

  if (target.type === 'comp') {
    ctxMenu.classList.add('ctx-type-comp');
    title.textContent = target.obj.partName + (target.obj.value ? ` (${target.obj.value})` : '');
    selectNetBtn.style.display = 'none';
  } else if (target.type === 'wire') {
    ctxMenu.classList.add('ctx-type-wire');
    const net = target.obj.netId ? state.schematic.nets[target.obj.netId] : null;
    title.textContent = net ? `Wire — ${net.name || target.obj.netId}` : 'Wire';
    selectNetBtn.style.display = target.obj.netId ? 'flex' : 'none';
  } else if (target.type === 'via') {
    ctxMenu.classList.add('ctx-type-via');
    title.textContent = `Via (${target.obj.startLayer} → ${target.obj.endLayer})`;
    selectNetBtn.style.display = 'none';
  }

  // Show menu within viewport
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

// ── Context menu action handlers ──
document.getElementById('ctx-delete')?.addEventListener('click', () => {
  if (!_ctxTarget) { hideCtxMenu(); return; }
  state.pushUndo();
  if (_ctxTarget.type === 'comp') {
    _actionTarget = _ctxTarget.obj;
    state.removeComponent(_ctxTarget.obj.id);
    hideCompActions();
    hidePanel();
    setMsg('Component deleted');
  } else if (_ctxTarget.type === 'wire') {
    state.removeWire(_ctxTarget.obj.id);
    _selectedWireId = null;
    setMsg('Wire deleted');
  } else if (_ctxTarget.type === 'via') {
    state.removeVia(_ctxTarget.obj.id);
    _selectedViaId = null;
    setMsg('Via deleted');
  }
  renderer.render();
  hideCtxMenu();
});

document.getElementById('ctx-rotate')?.addEventListener('click', () => {
  if (_ctxTarget?.type === 'comp') { _actionTarget = _ctxTarget.obj; rotateSelected(); }
  hideCtxMenu();
});
document.getElementById('ctx-mirror')?.addEventListener('click', () => {
  if (_ctxTarget?.type === 'comp') { _actionTarget = _ctxTarget.obj; mirrorSelected(); }
  hideCtxMenu();
});
document.getElementById('ctx-replace')?.addEventListener('click', () => {
  if (_ctxTarget?.type === 'comp') { _actionTarget = _ctxTarget.obj; replaceSelected(); }
  hideCtxMenu();
});
document.getElementById('ctx-properties')?.addEventListener('click', () => {
  if (_ctxTarget?.type === 'comp') {
    onComponentSelect(_ctxTarget.obj.partId);
    showCompActions(_ctxTarget.obj);
  }
  hideCtxMenu();
});
document.getElementById('ctx-connections')?.addEventListener('click', () => {
  if (_ctxTarget?.type !== 'comp') { hideCtxMenu(); return; }
  const comp  = _ctxTarget.obj;
  const nets  = comp.pins.filter(p => p.netId).map(p => `${p.name}: ${p.netId}`);
  const msg   = nets.length ? nets.join(', ') : 'No connected nets';
  setMsg(`${comp.partName} connections — ${msg}`);
  hideCtxMenu();
});

document.getElementById('ctx-wire-info')?.addEventListener('click', () => {
  if (_ctxTarget?.type !== 'wire') { hideCtxMenu(); return; }
  const w = _ctxTarget.obj;
  const net = w.netId ? state.schematic.nets[w.netId] : null;
  const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) * 2.54;
  setMsg(`Wire: ${net?.name || w.netId || 'unconnected'} — ${len.toFixed(1)} mm`);
  hideCtxMenu();
});

document.getElementById('ctx-via-info')?.addEventListener('click', () => {
  if (_ctxTarget?.type !== 'via') { hideCtxMenu(); return; }
  const v = _ctxTarget.obj;
  setMsg(`Via: ${v.startLayer} → ${v.endLayer}, pad ${v.padDiameter ?? 1.8}mm, drill ${v.drillDiameter ?? 0.6}mm`);
  hideCtxMenu();
});

document.getElementById('ctx-select-net')?.addEventListener('click', () => {
  if (_ctxTarget?.type === 'wire' && _ctxTarget.obj.netId) {
    const netId = _ctxTarget.obj.netId;
    // Select all wires in this net
    Object.values(state.schematic.wires).forEach(w => { w.selected = w.netId === netId; });
    const count = Object.values(state.schematic.wires).filter(w => w.netId === netId).length;
    setMsg(`Selected ${count} wires on net ${netId}`);
    renderer.render();
  }
  hideCtxMenu();
});

// Close context menu on click or touch outside
function _dismissMenus(e) {
  if (!ctxMenu.contains(e.target)) hideCtxMenu();
}
document.addEventListener('click',      _dismissMenus);
document.addEventListener('touchstart', _dismissMenus, { passive: true });

// ── Unified hit-test for context menu (component → wire → via) ──
function _ctxHitTest(worldX, worldY) {
  const comp = hitTest(worldX, worldY);
  if (comp) return { type: 'comp', obj: comp };

  const wire = renderer.wireHitTest(worldX, worldY);
  if (wire) return { type: 'wire', obj: wire };

  const via = renderer.viaHitTest(worldX, worldY);
  if (via) return { type: 'via', obj: via };

  return null;
}

function _selectCtxTarget(target) {
  // Deselect everything first
  Object.values(state.schematic.components).forEach(c => c.selected = false);
  Object.values(state.schematic.wires).forEach(w => { w.selected = false; });
  Object.values(state.pcb.vias).forEach(v => { v.selected = false; });
  _selectedWireId = null;
  _selectedViaId  = null;

  if (target.type === 'comp') {
    target.obj.selected = true;
    showCompActions(target.obj);
  } else if (target.type === 'wire') {
    target.obj.selected = true;
    _selectedWireId = target.obj.id;
    hideCompActions();
  } else if (target.type === 'via') {
    target.obj.selected = true;
    _selectedViaId = target.obj.id;
    hideCompActions();
  }
}

// Right-click on canvas → context menu
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const rect  = canvas.getBoundingClientRect();
  const world = renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  const target = _ctxHitTest(world.x, world.y);
  if (target) {
    _selectCtxTarget(target);
    showCtxMenu(target, e.clientX, e.clientY);
    renderer.render();
  }
});

// Long-press on canvas → context menu (touch)
let _longPressTimer = null;
canvas.addEventListener('touchstart', e2 => {
  if (e2.touches.length !== 1) return;
  const t = e2.touches[0];
  _longPressTimer = setTimeout(() => {
    if (activeTool === 'wire') return;   // don't show context menu in wire mode
    const rect  = canvas.getBoundingClientRect();
    const world = renderer.screenToWorld(t.clientX - rect.left, t.clientY - rect.top);
    const target = _ctxHitTest(world.x, world.y);
    if (target) {
      _selectCtxTarget(target);
      showCtxMenu(target, t.clientX, t.clientY);
      renderer.render();
      // Vibrate feedback for touch devices
      if (navigator.vibrate) navigator.vibrate(30);
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
    document.getElementById('replace-search').addEventListener('input', () => buildReplaceList(modal._targetComp));
  }
  modal._targetComp = comp;
  document.getElementById('replace-search').value = '';
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
      state.pushUndo();
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
    case 'p':  setTool('probe-v'); break;
    case 'g':  renderer.showGrid = !renderer.showGrid; renderer.render(); break;
    case '+':  case '=': renderer.zoomAt(canvas.width/2, canvas.height/2, 1.25); updateZoomDisplay(); break;
    case '-':  renderer.zoomAt(canvas.width/2, canvas.height/2, 0.8); updateZoomDisplay(); break;
    case 'tab':
      // Tab cancels wire mode (useful for trackpad users who can't right-click easily)
      e.preventDefault();
      if (wireTool.active) {
        wireTool.end();
        renderer._wirePreview = null;
        setMsg('Wire cancelled');
      }
      setTool(null);
      renderer.render();
      break;
    case 'escape':
      renderer._wirePreview = null;
      if (wireTool.active) wireTool.end();
      setTool(null);
      // Deselect all
      Object.values(state.schematic.components).forEach(c => { c.selected = false; });
      Object.values(state.schematic.wires).forEach(w => { w.selected = false; });
      Object.values(state.pcb.vias).forEach(v => { v.selected = false; });
      _selectedWireId = null;
      _selectedViaId  = null;
      hideCompActions();
      renderer.render();
      break;
    case 'delete':
    case 'backspace': {
      const hasSelected = Object.values(state.schematic.components).some(c => c.selected)
        || _selectedWireId || _selectedViaId;
      if (hasSelected) state.pushUndo();
      // Delete selected components
      Object.values(state.schematic.components)
        .filter(c => c.selected)
        .forEach(c => state.removeComponent(c.id));
      hideCompActions();
      // Delete selected wire
      if (_selectedWireId) {
        state.removeWire(_selectedWireId);
        _selectedWireId = null;
        setMsg('Wire deleted');
      }
      // Delete selected via
      if (_selectedViaId) {
        state.removeVia(_selectedViaId);
        _selectedViaId = null;
        setMsg('Via deleted');
      }
      renderer.render();
      break;
    }
  }
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (state.undo()) { renderer.render(); setMsg('Undo'); }
    }
    if (e.key === 'z' && e.shiftKey || e.key === 'y') {
      e.preventDefault();
      if (state.redo()) { renderer.render(); setMsg('Redo'); }
    }
    if (e.key === 's') { e.preventDefault(); saveLocal(); }
    if (e.key === '0') { e.preventDefault(); renderer.fitAll(); updateZoomDisplay(); }
    if (e.key === 'a') {
      e.preventDefault();
      Object.values(state.schematic.components).forEach(c => c.selected = true);
      renderer.render();
    }
  }
});

// ── Component library drawer ──────────────────────────────────────────────────
const panelLeft   = document.getElementById('panel-left');
const backdrop    = document.getElementById('lib-backdrop');
const btnLibOpen  = document.getElementById('btn-lib-open');
const btnLibClose = document.getElementById('btn-lib-collapse');

function openLibPanel() {
  panelLeft?.classList.remove('collapsed');
  backdrop?.classList.add('visible');
  btnLibOpen?.classList.add('hidden-toggle');
}
function closeLibPanel() {
  panelLeft?.classList.add('collapsed');
  backdrop?.classList.remove('visible');
  btnLibOpen?.classList.remove('hidden-toggle');
}

btnLibOpen?.addEventListener('click',  openLibPanel);
btnLibClose?.addEventListener('click', closeLibPanel);
backdrop?.addEventListener('click',    closeLibPanel);

// ── Toolbar buttons ───────────────────────────────────────────────────────────
document.getElementById('btn-wire')?.addEventListener('click',    () => setTool('wire'));
document.getElementById('btn-via')?.addEventListener('click',     () => setTool('via'));
document.getElementById('btn-probe-v')?.addEventListener('click', () => setTool('probe-v'));
document.getElementById('btn-probe-a')?.addEventListener('click', () => setTool('probe-a'));

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

// ── Autorouter ───────────────────────────────────────────────────────────────
document.getElementById('btn-autoroute')?.addEventListener('click', () => {
  // Auto-switch to PCB mode if needed
  if (state.mode !== 'pcb') {
    const pcbBtn = document.querySelector('[data-mode="pcb"]');
    if (pcbBtn) pcbBtn.click();
  }
  setMsg('Running autorouter…');
  setTimeout(() => {
    const result = autoRoute();
    // Highlight failed ratsnest in red
    if (result.failed > 0) {
      renderer.failedRatsnest = state.pcb.ratsnest.slice();
    } else {
      renderer.failedRatsnest = [];
    }
    renderer.render();
    const msg = result.failed > 0
      ? `Autoroute: ${result.routed} routed, ${result.failed} FAILED (shown in red)`
      : `Autoroute complete: ${result.routed} connections routed successfully`;
    setMsg(msg);
  }, 50); // Small delay for UI feedback
});

// ── Copper Pour ──────────────────────────────────────────────────────────────
document.getElementById('btn-copper-pour')?.addEventListener('click', () => {
  if (state.mode !== 'pcb') {
    setMsg('Switch to PCB mode first');
    return;
  }
  // Find GND net or first available net
  const gndNet = Object.values(state.schematic.nets).find(n =>
    n.name?.toLowerCase().includes('gnd') || n.netClass === 'GND'
  );
  const netId = gndNet?.id ?? null;
  const pour = createCopperPour(netId);
  renderer.render();
  setMsg(`Copper pour created (${gndNet?.name ?? 'no net'})`);
});

// ── PDF Export ───────────────────────────────────────────────────────────────
document.getElementById('btn-pdf-export')?.addEventListener('click', () => {
  setMsg('Generating PDF…');
  exportSchematicPDF();
  setMsg('PDF exported — check downloads');
});

// ── AC Analysis (Bode Plot) ──────────────────────────────────────────────────
document.getElementById('btn-ac-analysis')?.addEventListener('click', () => {
  const result = computeACResponse();
  plotACResponse(result);
  const fc = result.circuit.params.fc ?? result.circuit.params.f0;
  setMsg(`AC Analysis: ${result.circuit.topology.replace(/_/g, ' ')}${fc ? ` — fc = ${fc.toFixed(1)} Hz` : ''}`);
});

// ── DC Sweep Analysis ────────────────────────────────────────────────────────
document.getElementById('btn-dc-sweep')?.addEventListener('click', () => {
  const result = computeDCSweep();
  plotDCSweep(result);
  setMsg(`DC Sweep: ${result.topology.replace(/_/g, ' ')} — ${result.points.length} points`);
});

// ── Noise Analysis ───────────────────────────────────────────────────────────
document.getElementById('btn-noise-analysis')?.addEventListener('click', () => {
  const result = computeNoiseAnalysis();
  console.log('[Noise Analysis]', result);
  if (result.contributions.length === 0) {
    setMsg('Noise Analysis: No resistors found in circuit');
  } else {
    const nV = (result.totalNoise * 1e6).toFixed(2);
    setMsg(`Total noise: ${nV} µV RMS (${result.contributions.length} resistors, BW: ${(result.bandwidth / 1e6).toFixed(1)} MHz)`);
  }
});

// ── Impedance Calculator ─────────────────────────────────────────────────────
document.getElementById('btn-impedance')?.addEventListener('click', () => {
  const result = calculateMicrostripImpedance();
  setMsg(`Z₀ = ${result.impedance.toFixed(1)}Ω (microstrip, w=${result.traceWidth}mm, h=${result.dielectricHeight}mm)`);
});

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

    document.documentElement.dataset.mode = mode;

    if (mode === 'schematic') {
      applyTheme('schematic');
      switchToSchematicMode(renderer);
      toggle2D3DView('2d', canvas, three);
    } else if (mode === 'pcb') {
      applyTheme('pcb');
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
if (saved) {
  try {
    state.fromJSON(saved);
    // Sync UI mode buttons with restored state
    const restoredMode = state.mode || 'schematic';
    document.querySelectorAll('[data-mode]').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-mode="${restoredMode}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    document.documentElement.dataset.mode = restoredMode;
    applyTheme(restoredMode === 'pcb' ? 'pcb' : 'schematic');
    // If restored to 3D or simulation, fall back to last 2D mode
    if (restoredMode === '3d' || restoredMode === 'simulation') {
      state.mode = Object.keys(state.pcb.components).length > 0 ? 'pcb' : 'schematic';
      applyTheme(state.mode === 'pcb' ? 'pcb' : 'schematic');
    }
  } catch { /* ignore corrupt autosave */ }
}

state.subscribe(() => renderer.render());

// ── Context panel ─────────────────────────────────────────────────────────────
initPanel();

// ── Utilities ─────────────────────────────────────────────────────────────────
function setTool(tool) {
  activeTool = tool;
  renderer._wirePreview = null;
  if (tool === null && wireTool.active) wireTool.end();
  // Show pin targets overlay when wire tool is active (helps touch users)
  renderer.showPinTargets = (tool === 'wire');
  renderer.render();

  document.querySelectorAll('.tb-btn').forEach(b => b.classList.remove('active'));
  if (tool === 'wire')    document.getElementById('btn-wire')?.classList.add('active');
  if (tool === 'via')     document.getElementById('btn-via')?.classList.add('active');
  if (tool === 'probe-v') document.getElementById('btn-probe-v')?.classList.add('active');
  if (tool === 'probe-a') document.getElementById('btn-probe-a')?.classList.add('active');

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
// Sync initial mode from state (may have been restored by autosave above)
const initMode = state.mode === 'pcb' ? 'pcb' : 'schematic';
document.documentElement.dataset.mode = initMode;
applyTheme(initMode);
renderer.renderImmediate();
updateZoomDisplay();
setMsg('Ready — drag components from the sidebar onto the canvas to begin');
