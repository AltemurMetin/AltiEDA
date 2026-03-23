/**
 * AltiEDA – Canvas Renderer (Altium-style)
 * Proper schematic symbols, dot grid, professional rendering.
 */
import { state } from './schematicState.js';
import { NetClass } from './dataModels.js';
import { FOOTPRINT_MAP } from './footprintLibrary.js';

// ── Color themes ──────────────────────────────────────────────────────────────
const THEMES = {
  schematic: {
    bg:           '#c8c4b8',
    gridDot:      '#aaa898',
    gridDotMajor: '#8a8678',
    wire:         '#8b1a00',
    wireHover:    '#cc3300',
    junction:     '#8b1a00',
    pin:          '#8b1a00',
    pinUnconn:    '#cc4400',
    compBody:     '#c8c4b8',
    compBorder:   '#8b1a00',
    compText:     '#1a0a00',
    compValue:    '#3d1400',
    selected:     '#0055cc',
    ratsnest:     '#cc6600',
    drcErr:       '#ff0000',
    probe:        '#6600cc',
    via:          '#884400',
    traceF:       '#8b1a00',
    traceB:       '#004488',
    symR:         '#8b1a00',
    symC:         '#8b1a00',
    symLED:       '#8b1a00',
    symVCC:       '#8b0000',
    symGND:       '#3d1400',
    symL:         '#8b1a00',
    nets: {
      [NetClass.GND]:    '#3d1400',
      [NetClass.POWER]:  '#8b0000',
      [NetClass.I2C]:    '#8b1a00',
      [NetClass.SPI]:    '#6600cc',
      [NetClass.UART]:   '#884400',
      [NetClass.PWM]:    '#8b1a00',
      [NetClass.SIGNAL]: '#8b1a00',
    },
  },
  pcb: {
    bg:           '#050505',
    gridDot:      '#181818',
    gridDotMajor: '#242424',
    wire:         '#4ec9b0',
    wireHover:    '#7eeedd',
    junction:     '#4ec9b0',
    pin:          '#569cd6',
    pinUnconn:    '#555555',
    compBody:     '#0d0d0d',
    compBorder:   '#2a6496',
    compText:     '#888888',
    compValue:    '#666666',
    selected:     '#ffcc02',
    ratsnest:     '#ff8c00',
    drcErr:       '#f44747',
    probe:        '#c586c0',
    via:          '#c8963e',
    traceF:       '#c8963e',
    traceB:       '#3a8dc8',
    symR:         '#4ec9b0',
    symC:         '#4ec9b0',
    symLED:       '#4ec9b0',
    symVCC:       '#f44747',
    symGND:       '#6a9955',
    nets: {
      [NetClass.GND]:    '#6a9955',
      [NetClass.POWER]:  '#f44747',
      [NetClass.I2C]:    '#569cd6',
      [NetClass.SPI]:    '#c586c0',
      [NetClass.UART]:   '#ce9178',
      [NetClass.PWM]:    '#dcdcaa',
      [NetClass.SIGNAL]: '#555555',
    },
    symL: '#4ec9b0',
  },
};

// Active color set (mutable, shared with all drawing code)
const C = { ...THEMES.schematic };

export function applyTheme(mode) {
  const t = THEMES[mode] ?? THEMES.schematic;
  Object.assign(C, t);
}

const GRID = 20;       // px per grid unit at zoom=1 (≈ 2.54mm)
const PIN_R = 3;

export class CanvasRenderer {
  constructor(el) {
    this.canvas = el;
    this.ctx    = el.getContext('2d');
    this.ox = 0; this.oy = 0;
    this.zoom = 1;
    this.showGrid = true;
    this.drcViolations = [];
    this.suggestions   = [];
    this._raf = null;
    this._flash = false;

    this._resize();
    window.addEventListener('resize', () => this._resize());
    setInterval(() => {
      this._flash = !this._flash;
      if (this.drcViolations.length) this.render();
    }, 500);
  }

  /* ── Theme switching ──────────────────────────────────────────────────── */
  applyTheme(mode) { applyTheme(mode); }

  /* ── Coordinate helpers ─────────────────────────────────────────────────── */
  s2w(sx, sy) {
    return { x: (sx - this.ox) / (GRID * this.zoom),
             y: (sy - this.oy) / (GRID * this.zoom) };
  }
  w2s(wx, wy) {
    return { x: wx * GRID * this.zoom + this.ox,
             y: wy * GRID * this.zoom + this.oy };
  }
  snap(wx, wy) {
    return { x: Math.round(wx), y: Math.round(wy) };
  }
  // Alias used by routing tools
  snapToGrid(wx, wy) { return this.snap(wx, wy); }
  screenToWorld(sx, sy) { return this.s2w(sx, sy); }

  /* ── Pan / Zoom ─────────────────────────────────────────────────────────── */
  pan(dx, dy) { this.ox += dx; this.oy += dy; this.render(); }

  zoomAt(sx, sy, f) {
    const w = this.s2w(sx, sy);
    this.zoom = Math.max(0.08, Math.min(20, this.zoom * f));
    const s = this.w2s(w.x, w.y);
    this.ox += sx - s.x; this.oy += sy - s.y;
    this.render();
  }

  fitAll() {
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;

    if (state.mode === 'pcb') {
      // In PCB mode, fit to board bounds + pcb components
      const board = state.pcb.board;
      if (board) {
        minX = board.x; minY = board.y;
        maxX = board.x + board.width; maxY = board.y + board.height;
      }
      for (const c of Object.values(state.pcb.components)) {
        minX=Math.min(minX,c.x-5); minY=Math.min(minY,c.y-5);
        maxX=Math.max(maxX,c.x+5); maxY=Math.max(maxY,c.y+5);
      }
    } else {
      // Schematic mode
      const comps = Object.values(state.schematic.components);
      if (!comps.length) { this.ox = this.canvas.width/2; this.oy = this.canvas.height/2; this.zoom = 1; this.render(); return; }
      for (const c of comps) {
        minX=Math.min(minX,c.x-5); minY=Math.min(minY,c.y-5);
        maxX=Math.max(maxX,c.x+5); maxY=Math.max(maxY,c.y+5);
      }
    }

    if (!isFinite(minX)) { this.ox = this.canvas.width/2; this.oy = this.canvas.height/2; this.zoom = 1; this.render(); return; }

    const pw=this.canvas.width*0.85, ph=this.canvas.height*0.85;
    const zx=pw/((maxX-minX)*GRID), zy=ph/((maxY-minY)*GRID);
    this.zoom = Math.min(zx,zy,5);
    const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
    const sc=this.w2s(cx,cy);
    this.ox+=this.canvas.width/2-sc.x;
    this.oy+=this.canvas.height/2-sc.y;
    this.render();
  }

  _resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width  = r.width;
    this.canvas.height = r.height;
    // Center origin on first resize
    if (this.ox === 0 && this.oy === 0) {
      this.ox = r.width  / 2;
      this.oy = r.height / 2;
    }
    this.render();
  }

  /* ── Main render ────────────────────────────────────────────────────────── */
  render() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._draw());
  }

  _draw() {
    const { ctx, canvas } = this;
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (this.showGrid) this._drawGrid();

    if (state.mode === 'pcb') {
      // PCB mode: draw board outline, copper traces, footprints, vias, ratsnest
      this._drawBoardOutline();
      this._drawPCBTraces();
      this._drawPCBComponents();
      this._drawVias();
      this._drawRatsnest();
      this._drawDRC();
    } else {
      // Schematic mode
      this._drawWires();
      this._drawComponents();
      if (this.showPinTargets) this._drawPinTargets();
      this._drawJunctions();
      this._drawVias();
      this._drawProbes();
      this._drawSuggestions();
      this._drawRatsnest();
      this._drawDRC();
      if (this._wirePreview) this._drawWirePreview();
    }
  }

  /* ── Dot Grid ───────────────────────────────────────────────────────────── */
  _drawGrid() {
    const { ctx, canvas, zoom, ox, oy } = this;
    const step  = GRID * zoom;
    const major = 10;

    const x0 = ((ox % step) + step) % step - step;
    const y0 = ((oy % step) + step) % step - step;

    // Full line grid — her minor adımda tam çizgi (Proteus ISIS stili)
    ctx.setLineDash([]);
    // Minor lines
    ctx.strokeStyle = C.gridDot;
    ctx.lineWidth   = 0.4;
    for (let x = x0; x < canvas.width + step; x += step) {
      const isMajorX = Math.abs(Math.round((x - ox) / step) % major) === 0;
      if (isMajorX) continue;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = y0; y < canvas.height + step; y += step) {
      const isMajorY = Math.abs(Math.round((y - oy) / step) % major) === 0;
      if (isMajorY) continue;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    // Major lines (darker, slightly thicker)
    ctx.strokeStyle = C.gridDotMajor;
    ctx.lineWidth   = 0.7;
    const majorStep = step * major;
    const mx0 = ((ox % majorStep) + majorStep) % majorStep - majorStep;
    const my0 = ((oy % majorStep) + majorStep) % majorStep - majorStep;
    for (let x = mx0; x < canvas.width + majorStep; x += majorStep) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = my0; y < canvas.height + majorStep; y += majorStep) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }

  /* ── Pin targets (shown in wire mode) ──────────────────────────────────── */
  _drawPinTargets() {
    const { ctx } = this;
    const r   = Math.max(10, 14 * this.zoom);   // large touch target
    const lw  = Math.max(1.5, 2 * this.zoom);
    for (const comp of Object.values(state.schematic.components)) {
      for (const pin of comp.pins) {
        const px = comp.x + pin.offsetX / GRID;   // offsetX is in canvas-px units → divide by GRID
        const py = comp.y + pin.offsetY / GRID;
        const s  = this.w2s(px, py);
        const connected = !!pin.netId;
        ctx.strokeStyle = connected ? '#4ade80' : '#60a5fa';
        ctx.fillStyle   = connected ? 'rgba(74,222,128,0.12)' : 'rgba(96,165,250,0.12)';
        ctx.lineWidth   = lw;
        ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // Dot at center
        ctx.fillStyle = connected ? '#4ade80' : '#60a5fa';
        ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(2, 3 * this.zoom), 0, Math.PI * 2);
        ctx.fill();
        // Pin name (small label)
        if (this.zoom > 0.6) {
          ctx.fillStyle    = connected ? '#4ade80' : '#93c5fd';
          ctx.font         = `${Math.max(7, 8 * this.zoom)}px monospace`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'top';
          ctx.globalAlpha  = 0.8;
          ctx.fillText(pin.name, s.x, s.y + r + 2);
          ctx.globalAlpha  = 1;
          ctx.textBaseline = 'alphabetic';
        }
      }
    }
  }

  /* ── Wire hit test ──────────────────────────────────────────────────────── */
  wireHitTest(wx, wy) {
    const tolerancePx = 6;
    const worldTol    = tolerancePx / (GRID * this.zoom);
    for (const w of Object.values(state.schematic.wires)) {
      if (_segDistWorld(wx, wy, w.x1, w.y1, w.x2, w.y2) < worldTol) return w;
    }
    return null;
  }

  /* ── Via hit test ───────────────────────────────────────────────────────── */
  viaHitTest(wx, wy) {
    for (const v of Object.values(state.pcb.vias)) {
      const dx = wx - v.x;
      const dy = wy - v.y;
      const r  = (v.padDiameter ?? 1.8) / 2;
      if (Math.sqrt(dx * dx + dy * dy) <= r) return v;
    }
    return null;
  }

  /* ── Wires ──────────────────────────────────────────────────────────────── */
  _drawWires() {
    const { ctx } = this;
    const lw = Math.max(1.5, 1.5 * this.zoom);
    ctx.lineCap = 'round';
    for (const w of Object.values(state.schematic.wires)) {
      const p1 = this.w2s(w.x1, w.y1), p2 = this.w2s(w.x2, w.y2);
      ctx.strokeStyle = w.selected ? C.selected : C.wire;
      ctx.lineWidth   = w.selected ? lw * 2 : lw;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.lineWidth = lw;
  }

  /* ── Wire preview (while placing) ──────────────────────────────────────── */
  _drawWirePreview() {
    const { ctx, _wirePreview: wp } = this;
    const lw = Math.max(1.5, 1.5 * this.zoom);
    ctx.lineWidth = lw;
    ctx.lineCap   = 'round';
    ctx.setLineDash([6, 4]);

    // L-shape: two segments
    const hasBend = wp.mx != null;
    if (hasBend) {
      const p1 = this.w2s(wp.x1, wp.y1);
      const pm = this.w2s(wp.mx, wp.my);
      const p2 = this.w2s(wp.x2, wp.y2);
      ctx.strokeStyle = C.wireHover;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(pm.x, pm.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      // Snap indicator
      const snapColor = wp.snapOk ? '#4ade80' : '#f47171';
      const r = Math.max(4, 5 * this.zoom);
      ctx.setLineDash([]);
      ctx.strokeStyle = snapColor;
      ctx.lineWidth   = 1.5;
      ctx.beginPath(); ctx.arc(p2.x, p2.y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p2.x - r, p2.y); ctx.lineTo(p2.x + r, p2.y);
      ctx.moveTo(p2.x, p2.y - r); ctx.lineTo(p2.x, p2.y + r);
      ctx.stroke();
    } else {
      // Fallback: straight line
      const p1 = this.w2s(wp.x1, wp.y1), p2 = this.w2s(wp.x2, wp.y2);
      ctx.strokeStyle = C.wireHover;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.setLineDash([]);
  }

  /* ── Components ─────────────────────────────────────────────────────────── */
  _drawComponents() {
    for (const comp of Object.values(state.schematic.components))
      this._drawComponent(comp);
  }

  _drawComponent(comp) {
    const { ctx, zoom } = this;
    const s = this.w2s(comp.x, comp.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(comp.rotation * Math.PI / 180);

    switch (comp.partId) {
      case 'R_GENERIC':    this._symResistor(comp);  break;
      case 'C_GENERIC':    this._symCapacitor(comp); break;
      case 'LED_GENERIC':  this._symLED(comp);       break;
      case 'L_GENERIC':    this._symInductor(comp);  break;
      case 'D_1N4007':
      case 'D_ZENER':
      case 'D_SCHOTTKY':   this._symDiode(comp);     break;
      case 'Q_NPN_BC547':  this._symNPN(comp);       break;
      case 'Q_PNP_BC557':  this._symPNP(comp);       break;
      case 'Q_NMOS_2N7000':this._symNMOS(comp);      break;
      case 'BTN_TACT':     this._symButton(comp);    break;
      case 'CRYSTAL':      this._symCrystal(comp);   break;
      case 'PWR_VCC':      this._symVCC(comp);       break;
      case 'PWR_GND':      this._symGND(comp);       break;
      default:           this._symIC(comp);         break;
    }

    ctx.restore();
  }

  /* ──────────────────────────────────────────────────────────────────────────
     SCHEMATIC SYMBOLS
  ────────────────────────────────────────────────────────────────────────── */

  /* Resistor – American zigzag style */
  _symResistor(comp) {
    const { ctx } = this;
    const z = this.zoom;
    const lw = Math.max(1.2, 1.5 * z);
    const bw = 18 * z;   // body half-width
    const bh = 6 * z;    // body half-height
    const lead = 12 * z; // lead length

    ctx.strokeStyle = comp.selected ? C.selected : C.symR;
    ctx.lineWidth   = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Left lead
    ctx.beginPath(); ctx.moveTo(-(bw + lead), 0); ctx.lineTo(-bw, 0); ctx.stroke();
    // Right lead
    ctx.beginPath(); ctx.moveTo(bw, 0); ctx.lineTo(bw + lead, 0); ctx.stroke();

    // Zigzag body
    const peaks = 6;
    const pw = (bw * 2) / peaks;
    ctx.beginPath();
    ctx.moveTo(-bw, 0);
    for (let i = 0; i < peaks; i++) {
      const x = -bw + pw * (i + 0.5);
      const y = (i % 2 === 0) ? -bh : bh;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(bw, 0);
    ctx.stroke();

    // Pin dots
    this._pinDot(-(bw + lead), 0, comp.selected);
    this._pinDot(bw + lead, 0, comp.selected);

    // Labels
    this._symLabel(comp, 0, -(bh + 8 * z), 0, (bh + 6 * z), z);
  }

  /* Capacitor */
  _symCapacitor(comp) {
    const { ctx } = this;
    const z = this.zoom;
    const lw = Math.max(1.2, 1.5 * z);
    const gap = 4 * z;    // gap between plates
    const ph  = 14 * z;   // plate height half
    const lead = 16 * z;

    ctx.strokeStyle = comp.selected ? C.selected : C.symC;
    ctx.lineWidth   = lw;
    ctx.lineCap = 'round';

    // Leads
    ctx.beginPath(); ctx.moveTo(-(lead + gap), 0); ctx.lineTo(-gap, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gap, 0); ctx.lineTo(lead + gap, 0); ctx.stroke();

    // Plates
    ctx.lineWidth = Math.max(2, 2.5 * z);
    ctx.beginPath(); ctx.moveTo(-gap, -ph); ctx.lineTo(-gap, ph); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( gap, -ph); ctx.lineTo( gap, ph); ctx.stroke();

    // Pin dots
    this._pinDot(-(lead + gap), 0, comp.selected);
    this._pinDot(lead + gap, 0, comp.selected);

    this._symLabel(comp, 0, -(ph + 8 * z), 0, (ph + 6 * z), z);
  }

  /* LED – diode + light arrows */
  _symLED(comp) {
    const { ctx } = this;
    const z = this.zoom;
    const lw = Math.max(1.2, 1.5 * z);
    const r  = 12 * z;
    const lead = 12 * z;

    ctx.strokeStyle = comp.selected ? C.selected : C.symLED;
    ctx.fillStyle   = comp.selected ? C.selected : C.symLED;
    ctx.lineWidth   = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Leads
    ctx.beginPath(); ctx.moveTo(-(r + lead), 0); ctx.lineTo(-r, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r, 0);  ctx.lineTo(r + lead, 0); ctx.stroke();

    // Triangle (anode left → cathode right)
    ctx.beginPath();
    ctx.moveTo(-r,  r); ctx.lineTo(-r, -r);
    ctx.lineTo( r,  0); ctx.closePath();
    ctx.globalAlpha = 0.2; ctx.fill();
    ctx.globalAlpha = 1;   ctx.stroke();

    // Cathode bar
    ctx.lineWidth = Math.max(2, 2 * z);
    ctx.beginPath(); ctx.moveTo(r, -r); ctx.lineTo(r, r); ctx.stroke();
    ctx.lineWidth = lw;

    // Light arrows
    const ax = r * 0.3, ay = -r * 1.1;
    ctx.strokeStyle = '#dcdcaa';
    for (let i = 0; i < 2; i++) {
      const ox2 = ax + i * 8 * z;
      const oy2 = ay - i * 0;
      ctx.beginPath();
      ctx.moveTo(ox2, oy2);
      ctx.lineTo(ox2 + 7 * z, oy2 - 7 * z);
      ctx.stroke();
      // arrowhead
      ctx.beginPath();
      ctx.moveTo(ox2 + 7 * z, oy2 - 7 * z);
      ctx.lineTo(ox2 + 4 * z, oy2 - 7 * z);
      ctx.moveTo(ox2 + 7 * z, oy2 - 7 * z);
      ctx.lineTo(ox2 + 7 * z, oy2 - 4 * z);
      ctx.stroke();
    }
    ctx.strokeStyle = comp.selected ? C.selected : C.symLED;

    this._pinDot(-(r + lead), 0, comp.selected);
    this._pinDot(r + lead, 0, comp.selected);
    this._symLabel(comp, 0, -(r + 10 * z), 0, r + 8 * z, z);
  }

  /* Inductor – 4 upward semicircle bumps */
  _symInductor(comp) {
    const { ctx } = this;
    const z        = this.zoom;
    const lw       = Math.max(1.2, 1.5 * z);
    const numBumps = 4;
    const r        = 6 * z;          // bump radius
    const halfBody = numBumps * r;   // 24*z
    const lead     = 6 * z;          // 30-24=6

    const col = comp.selected ? C.selected : C.symL;
    ctx.strokeStyle = col;
    ctx.lineWidth   = lw;
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);

    // Left lead
    ctx.beginPath();
    ctx.moveTo(-(halfBody + lead), 0); ctx.lineTo(-halfBody, 0);
    ctx.stroke();
    // Right lead
    ctx.beginPath();
    ctx.moveTo(halfBody, 0); ctx.lineTo(halfBody + lead, 0);
    ctx.stroke();

    // 4 upward bumps (counterclockwise = top half in canvas coords)
    ctx.beginPath();
    ctx.moveTo(-halfBody, 0);
    for (let i = 0; i < numBumps; i++) {
      const cx = -halfBody + r + i * 2 * r;
      ctx.arc(cx, 0, r, Math.PI, 0, true);
    }
    ctx.stroke();

    // Pin dots
    this._pinDot(-(halfBody + lead), 0, comp.selected);
    this._pinDot(halfBody + lead, 0, comp.selected);

    // Labels
    this._symLabel(comp, 0, -(r + 8 * z), 0, r + 6 * z, z);
  }

  /* Diode (also Zener / Schottky variants) */
  _symDiode(comp) {
    const { ctx } = this;
    const z = this.zoom, lw = Math.max(1.2, 1.5*z);
    const r = 12*z, lead = 12*z;
    const col = comp.selected ? C.selected : C.symR;
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-(r+lead), 0); ctx.lineTo(-r, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r, 0);  ctx.lineTo(r+lead, 0); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r, r); ctx.lineTo(-r, -r); ctx.lineTo(r, 0); ctx.closePath();
    ctx.globalAlpha = 0.2; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
    ctx.lineWidth = Math.max(2, 2*z);
    ctx.beginPath(); ctx.moveTo(r, -r); ctx.lineTo(r, r); ctx.stroke();
    ctx.lineWidth = lw;
    if (comp.partId.includes('ZENER')) {
      ctx.beginPath();
      ctx.moveTo(r, -r); ctx.lineTo(r - 5*z, -r - 5*z);
      ctx.moveTo(r,  r); ctx.lineTo(r + 5*z,  r + 5*z);
      ctx.stroke();
    }
    if (comp.partId.includes('SCHOTTKY')) {
      ctx.beginPath();
      ctx.moveTo(r-4*z,-r); ctx.lineTo(r-4*z,-r+4*z); ctx.lineTo(r,-r+4*z);
      ctx.moveTo(r+4*z, r); ctx.lineTo(r+4*z, r-4*z); ctx.lineTo(r, r-4*z);
      ctx.stroke();
    }
    this._pinDot(-(r+lead), 0, comp.selected);
    this._pinDot(r+lead, 0, comp.selected);
    this._symLabel(comp, 0, -(r+10*z), 0, r+8*z, z);
  }

  /* NPN BJT */
  _symNPN(comp) {
    const { ctx } = this;
    const z = this.zoom, lw = Math.max(1.2, 1.5*z);
    const col = comp.selected ? C.selected : '#dcdcaa';
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.12;
    ctx.beginPath(); ctx.arc(0,0,16*z,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0,0,16*z,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-20*z,0); ctx.lineTo(-8*z,0); ctx.stroke();
    ctx.lineWidth = Math.max(2, 2.5*z);
    ctx.beginPath(); ctx.moveTo(-8*z,-12*z); ctx.lineTo(-8*z,12*z); ctx.stroke();
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(-8*z,-8*z); ctx.lineTo(12*z,-18*z); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8*z, 8*z); ctx.lineTo(12*z, 18*z); ctx.stroke();
    // Arrow on emitter (NPN: outward)
    { const ar=5*z, dx=20, dy=10, le=Math.sqrt(dx*dx+dy*dy), nx=dx/le, ny=dy/le;
      const tx=12*z, ty=18*z, bx=tx-nx*ar*1.4, by=ty-ny*ar*1.4;
      ctx.beginPath(); ctx.moveTo(tx,ty);
      ctx.lineTo(bx+ny*ar*0.5, by-nx*ar*0.5);
      ctx.lineTo(bx-ny*ar*0.5, by+nx*ar*0.5);
      ctx.closePath(); ctx.fill(); }
    this._pinDot(-20*z,0,comp.selected);
    this._pinDot(12*z,-18*z,comp.selected);
    this._pinDot(12*z, 18*z,comp.selected);
    this._symLabel(comp, 0, -22*z, 0, 26*z, z);
  }

  /* PNP BJT */
  _symPNP(comp) {
    const { ctx } = this;
    const z = this.zoom, lw = Math.max(1.2, 1.5*z);
    const col = comp.selected ? C.selected : '#dcdcaa';
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = 0.12;
    ctx.beginPath(); ctx.arc(0,0,16*z,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0,0,16*z,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-20*z,0); ctx.lineTo(-8*z,0); ctx.stroke();
    ctx.lineWidth = Math.max(2, 2.5*z);
    ctx.beginPath(); ctx.moveTo(-8*z,-12*z); ctx.lineTo(-8*z,12*z); ctx.stroke();
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(-8*z,-8*z); ctx.lineTo(12*z,-18*z); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8*z, 8*z); ctx.lineTo(12*z, 18*z); ctx.stroke();
    // Arrow on emitter (PNP: inward — at body end)
    { const ar=5*z, dx=20, dy=10, le=Math.sqrt(dx*dx+dy*dy), nx=dx/le, ny=dy/le;
      const ox=-8*z, oy=8*z, tx=ox+nx*ar*1.4, ty=oy+ny*ar*1.4;
      ctx.beginPath(); ctx.moveTo(ox,oy);
      ctx.lineTo(tx+ny*ar*0.5, ty-nx*ar*0.5);
      ctx.lineTo(tx-ny*ar*0.5, ty+nx*ar*0.5);
      ctx.closePath(); ctx.fill(); }
    this._pinDot(-20*z,0,comp.selected);
    this._pinDot(12*z,-18*z,comp.selected);
    this._pinDot(12*z, 18*z,comp.selected);
    this._symLabel(comp, 0, -22*z, 0, 26*z, z);
  }

  /* N-MOSFET */
  _symNMOS(comp) {
    const { ctx } = this;
    const z = this.zoom, lw = Math.max(1.2, 1.5*z);
    const col = comp.selected ? C.selected : '#dcdcaa';
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // Circle body
    ctx.globalAlpha = 0.12;
    ctx.beginPath(); ctx.arc(0,0,16*z,0,Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(0,0,16*z,0,Math.PI*2); ctx.stroke();
    // Gate lead
    ctx.beginPath(); ctx.moveTo(-24*z,0); ctx.lineTo(-12*z,0); ctx.stroke();
    // Gate vertical bar
    ctx.lineWidth = Math.max(2, 2.5*z);
    ctx.beginPath(); ctx.moveTo(-12*z,-10*z); ctx.lineTo(-12*z,10*z); ctx.stroke();
    ctx.lineWidth = lw;
    // Channel segments (D, Body, S)
    ctx.beginPath(); ctx.moveTo(-8*z,-10*z); ctx.lineTo(-8*z,-4*z); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8*z, -1*z); ctx.lineTo(-8*z,  1*z); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8*z,  4*z); ctx.lineTo(-8*z, 10*z); ctx.stroke();
    // Drain and source lines
    ctx.beginPath(); ctx.moveTo(-8*z,-10*z); ctx.lineTo(12*z,-18*z); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-8*z, 10*z); ctx.lineTo(12*z, 18*z); ctx.stroke();
    // Arrow on source (NMOS: inward on body)
    { const ar=5*z;
      ctx.beginPath();
      ctx.moveTo(-12*z,0);
      ctx.lineTo(-12*z-ar, -ar*0.5);
      ctx.lineTo(-12*z-ar,  ar*0.5);
      ctx.closePath(); ctx.fill(); }
    this._pinDot(-24*z,0,comp.selected);
    this._pinDot(12*z,-18*z,comp.selected);
    this._pinDot(12*z, 18*z,comp.selected);
    this._symLabel(comp, 0, -22*z, 0, 26*z, z);
  }

  /* Push Button (TACT) */
  _symButton(comp) {
    const { ctx } = this;
    const z = this.zoom, lw = Math.max(1.2, 1.5*z);
    const col = comp.selected ? C.selected : C.symR;
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const w = 12*z, h = 8*z, lead = 14*z;
    // Left leads
    ctx.beginPath(); ctx.moveTo(-(w+lead),-h); ctx.lineTo(-w,-h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-(w+lead), h); ctx.lineTo(-w, h); ctx.stroke();
    // Right leads
    ctx.beginPath(); ctx.moveTo(w, -h); ctx.lineTo(w+lead,-h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w,  h); ctx.lineTo(w+lead, h); ctx.stroke();
    // Vertical bars left/right
    ctx.beginPath(); ctx.moveTo(-w,-h*1.4); ctx.lineTo(-w,h*1.4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( w,-h*1.4); ctx.lineTo( w,h*1.4); ctx.stroke();
    // Dashed gap line
    ctx.setLineDash([3*z, 3*z]);
    ctx.beginPath(); ctx.moveTo(-w,0); ctx.lineTo(w,0); ctx.stroke();
    ctx.setLineDash([]);
    this._pinDot(-(w+lead),-h,comp.selected);
    this._pinDot(-(w+lead), h,comp.selected);
    this._pinDot( w+lead,  -h,comp.selected);
    this._pinDot( w+lead,   h,comp.selected);
    this._symLabel(comp, 0, -(h+14*z), 0, h+10*z, z);
  }

  /* Crystal */
  _symCrystal(comp) {
    const { ctx } = this;
    const z = this.zoom, lw = Math.max(1.2, 1.5*z);
    const col = comp.selected ? C.selected : C.symC;
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const hw = 8*z, hh = 12*z, lead = 16*z;
    // Leads
    ctx.beginPath(); ctx.moveTo(-lead,0); ctx.lineTo(-hw,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hw,0); ctx.lineTo(lead,0); ctx.stroke();
    // Body rect
    ctx.strokeRect(-hw,-hh,hw*2,hh*2);
    // Parallel plates
    ctx.lineWidth = Math.max(2, 2.5*z);
    ctx.beginPath(); ctx.moveTo(-hw*0.4,-hh); ctx.lineTo(-hw*0.4,hh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( hw*0.4,-hh); ctx.lineTo( hw*0.4,hh); ctx.stroke();
    this._pinDot(-lead,0,comp.selected);
    this._pinDot( lead,0,comp.selected);
    this._symLabel(comp, 0, -(hh+10*z), 0, hh+8*z, z);
  }

  /* VCC power flag */
  _symVCC(comp) {
    const { ctx } = this;
    const z = this.zoom;
    const lw = Math.max(1.2, 1.5 * z);

    ctx.strokeStyle = comp.selected ? C.selected : C.symVCC;
    ctx.lineWidth   = lw;
    ctx.lineCap = 'round';

    // Stem
    ctx.beginPath(); ctx.moveTo(0, 20 * z); ctx.lineTo(0, 4 * z); ctx.stroke();
    // Arrow head (pointing up)
    ctx.beginPath();
    ctx.moveTo(0, -10 * z);
    ctx.lineTo(-8 * z, 4 * z);
    ctx.lineTo(8 * z, 4 * z);
    ctx.closePath();
    ctx.fillStyle = comp.selected ? C.selected : C.symVCC;
    ctx.globalAlpha = 0.3; ctx.fill();
    ctx.globalAlpha = 1;   ctx.stroke();

    // Label
    ctx.fillStyle = comp.selected ? C.selected : C.symVCC;
    ctx.font      = `bold ${Math.max(9, 10 * z)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(comp.value || '+VCC', 0, -14 * z);

    this._pinDot(0, 20 * z, comp.selected);
  }

  /* GND power flag */
  _symGND(comp) {
    const { ctx } = this;
    const z = this.zoom;
    const lw = Math.max(1.2, 1.5 * z);

    ctx.strokeStyle = comp.selected ? C.selected : C.symGND;
    ctx.lineWidth   = lw;
    ctx.lineCap = 'round';

    // Stem
    ctx.beginPath(); ctx.moveTo(0, -20 * z); ctx.lineTo(0, 0); ctx.stroke();
    // Three bars
    const bars = [[16, 0], [10, 6], [5, 12]];
    for (const [hw, y] of bars) {
      ctx.beginPath();
      ctx.moveTo(-hw * z, y * z);
      ctx.lineTo( hw * z, y * z);
      ctx.stroke();
    }

    // Label
    ctx.fillStyle = comp.selected ? C.selected : C.symGND;
    ctx.font      = `bold ${Math.max(9, 10 * z)}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('GND', 0, 22 * z);

    this._pinDot(0, -20 * z, comp.selected);
  }

  /* Generic IC body — draws pins at their actual (offsetX*z, offsetY*z) positions */
  _symIC(comp) {
    const { ctx, zoom: z } = this;
    const pins = comp.pins ?? [];
    if (pins.length === 0) return;
    const lw      = comp.selected ? Math.max(2, 2*z) : Math.max(1, 1.2*z);
    const leadLen = 14 * z;

    // Separate pins by side (offsetX < 0 = left, > 0 = right, 0 = top/bottom)
    const leftPins   = pins.filter(p => p.offsetX < 0);
    const rightPins  = pins.filter(p => p.offsetX > 0);
    const topPins    = pins.filter(p => p.offsetX === 0 && p.offsetY <= 0);
    const bottomPins = pins.filter(p => p.offsetX === 0 && p.offsetY > 0);

    // Body bounds: inset from pin endpoints by leadLen
    const allPx = pins.map(p => p.offsetX * z);
    const allPy = pins.map(p => p.offsetY * z);
    const leftEdge   = (leftPins.length   > 0 ? Math.max(...leftPins.map(p => p.offsetX * z))   : Math.min(...allPx)) + leadLen;
    const rightEdge  = (rightPins.length  > 0 ? Math.min(...rightPins.map(p => p.offsetX * z))  : Math.max(...allPx)) - leadLen;
    const topEdge    = Math.min(...allPy) - 12 * z;
    const bottomEdge = Math.max(...allPy) + 12 * z;

    // Body
    ctx.fillStyle   = C.compBody;
    ctx.strokeStyle = comp.selected ? C.selected : C.compBorder;
    ctx.lineWidth   = lw;
    ctx.beginPath();
    ctx.roundRect(leftEdge, topEdge, rightEdge - leftEdge, bottomEdge - topEdge, 3 * z);
    ctx.fill(); ctx.stroke();

    // Name + value centred in body
    const cx = (leftEdge + rightEdge) / 2;
    ctx.fillStyle    = C.compText;
    ctx.font         = `bold ${Math.max(7, 9*z)}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(comp.partName.substring(0, 12), cx, topEdge + 5 * z);
    ctx.fillStyle    = C.compValue;
    ctx.font         = `${Math.max(6, 7*z)}px monospace`;
    ctx.fillText(comp.value || '', cx, topEdge + 17 * z);
    ctx.textBaseline = 'alphabetic';

    // Draw left pins
    for (const pin of leftPins) {
      const px = pin.offsetX * z, py = pin.offsetY * z;
      const bx = px + leadLen;   // body edge
      ctx.strokeStyle = comp.selected ? C.selected : C.pin;
      ctx.lineWidth   = Math.max(1, 1.2 * z);
      ctx.beginPath(); ctx.moveTo(bx, py); ctx.lineTo(px, py); ctx.stroke();
      this._pinDot(px, py, comp.selected);
      // Pin name
      ctx.fillStyle    = comp.selected ? C.selected : C.pin;
      ctx.font         = `${Math.max(5, 7*z)}px monospace`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(pin.name.substring(0, 9), bx + 2 * z, py);
      ctx.textBaseline = 'alphabetic';
    }

    // Draw right pins
    for (const pin of rightPins) {
      const px = pin.offsetX * z, py = pin.offsetY * z;
      const bx = px - leadLen;
      ctx.strokeStyle = comp.selected ? C.selected : C.pin;
      ctx.lineWidth   = Math.max(1, 1.2 * z);
      ctx.beginPath(); ctx.moveTo(bx, py); ctx.lineTo(px, py); ctx.stroke();
      this._pinDot(px, py, comp.selected);
      ctx.fillStyle    = comp.selected ? C.selected : C.pin;
      ctx.font         = `${Math.max(5, 7*z)}px monospace`;
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(pin.name.substring(0, 9), bx - 2 * z, py);
      ctx.textBaseline = 'alphabetic';
    }

    // Draw top / bottom pins (offsetX = 0)
    for (const pin of [...topPins, ...bottomPins]) {
      const px = pin.offsetX * z, py = pin.offsetY * z;
      const by = pin.offsetY > 0 ? bottomEdge : topEdge;
      ctx.strokeStyle = comp.selected ? C.selected : C.pin;
      ctx.lineWidth   = Math.max(1, 1.2 * z);
      ctx.beginPath(); ctx.moveTo(px, by); ctx.lineTo(px, py); ctx.stroke();
      this._pinDot(px, py, comp.selected);
      ctx.fillStyle    = comp.selected ? C.selected : C.pin;
      ctx.font         = `${Math.max(5, 7*z)}px monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = pin.offsetY > 0 ? 'top' : 'bottom';
      ctx.fillText(pin.name.substring(0, 9), px, by + (pin.offsetY > 0 ? 2 * z : -2 * z));
      ctx.textBaseline = 'alphabetic';
    }
  }

  /* Helper: pin endpoint circle */
  _pinDot(x, y, selected) {
    const { ctx } = this;
    ctx.fillStyle = selected ? C.selected : C.pin;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(2, PIN_R * this.zoom * 0.7), 0, Math.PI * 2);
    ctx.fill();
  }

  /* Helper: reference + value labels */
  _symLabel(comp, tx, ty, bx, by, z) {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.compText;
    ctx.font      = `bold ${Math.max(7, 9 * z)}px monospace`;
    ctx.fillText(comp.partName, tx, ty);
    ctx.fillStyle = C.compValue;
    ctx.font      = `${Math.max(6, 8 * z)}px monospace`;
    ctx.fillText(comp.value || '', bx, by);
  }

  /* ── Junctions ──────────────────────────────────────────────────────────── */
  _drawJunctions() {
    const { ctx } = this;
    ctx.fillStyle = C.junction;
    for (const j of state.schematic.junctions) {
      const s = this.w2s(j.x, j.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(3, 4 * this.zoom), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── Vias ───────────────────────────────────────────────────────────────── */
  _drawVias() {
    const { ctx } = this;
    for (const v of Object.values(state.pcb.vias)) {
      const s  = this.w2s(v.x, v.y);
      const r  = (v.padDiameter  / 2) * GRID * this.zoom;
      const dr = (v.drillDiameter / 2) * GRID * this.zoom;
      ctx.fillStyle   = v.selected ? C.selected : C.via;
      ctx.strokeStyle = v.selected ? C.selected : '#ffffff44';
      ctx.lineWidth   = v.selected ? 2 : 1;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle   = C.bg;
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(1, dr), 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ── Probes ─────────────────────────────────────────────────────────────── */
  _drawProbes() {
    const { ctx } = this;
    for (const p of Object.values(state.schematic.probes)) {
      const s    = this.w2s(p.x, p.y);
      const r    = Math.max(6, 8 * this.zoom);
      const isV  = p.probeType === 'voltage';
      const col  = isV ? '#c58ac0' : '#f0a946';   // purple = voltage, amber = current
      const fill = isV ? 'rgba(197,134,192,0.18)' : 'rgba(240,169,70,0.18)';
      const lbl  = isV ? 'V' : 'A';
      ctx.strokeStyle = col;
      ctx.fillStyle   = fill;
      ctx.lineWidth   = Math.max(1.5, 2 * this.zoom);
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // Stem (line from circle downward)
      ctx.beginPath();
      ctx.moveTo(s.x, s.y + r);
      ctx.lineTo(s.x, s.y + r + Math.max(5, 8 * this.zoom));
      ctx.stroke();
      // Label
      ctx.fillStyle    = col;
      ctx.font         = `bold ${Math.max(8, 10 * this.zoom)}px monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lbl, s.x, s.y);
      ctx.textBaseline = 'alphabetic';
      // Net name below
      if (p.netName) {
        ctx.fillStyle  = col;
        ctx.font       = `${Math.max(6, 7 * this.zoom)}px monospace`;
        ctx.globalAlpha = 0.8;
        ctx.fillText(p.netName, s.x, s.y + r + Math.max(16, 20 * this.zoom));
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ── AI Suggestions ─────────────────────────────────────────────────────── */
  _drawSuggestions() {
    const { ctx } = this;
    for (const sg of this.suggestions) {
      const p1 = this.w2s(sg.fromX, sg.fromY), p2 = this.w2s(sg.toX, sg.toY);
      const col = C.nets[sg.netClass] ?? '#888888';
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = col;
      ctx.lineWidth   = Math.max(1, 1.2 * this.zoom);
      ctx.globalAlpha = 0.7;
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      ctx.fillStyle  = col;
      ctx.font       = `${Math.max(8, 9 * this.zoom)}px monospace`;
      ctx.textAlign  = 'center';
      ctx.fillText(sg.label, mx, my - 5);
    }
  }

  /* ── Ratsnest ───────────────────────────────────────────────────────────── */
  _drawRatsnest() {
    const { ctx } = this;
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = C.ratsnest;
    ctx.lineWidth   = 0.8;
    ctx.globalAlpha = 0.5;
    for (const rn of state.pcb.ratsnest) {
      const p1 = this.w2s(rn.x1, rn.y1), p2 = this.w2s(rn.x2, rn.y2);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }

  /* ── DRC overlays ───────────────────────────────────────────────────────── */
  _drawDRC() {
    if (!this.drcViolations.length) return;
    const { ctx } = this;
    ctx.strokeStyle = C.drcErr;
    ctx.lineWidth   = Math.max(1.5, 2 * this.zoom);
    ctx.globalAlpha = this._flash ? 0.9 : 0.35;
    for (const v of this.drcViolations) {
      if (v.x == null) continue;
      const s = this.w2s(v.x, v.y);
      const r = Math.max(8, 12 * this.zoom);
      // X marker
      ctx.beginPath();
      ctx.moveTo(s.x - r, s.y - r); ctx.lineTo(s.x + r, s.y + r);
      ctx.moveTo(s.x + r, s.y - r); ctx.lineTo(s.x - r, s.y + r);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PCB MODE RENDERING
  ══════════════════════════════════════════════════════════════════════════ */

  /* ── Board outline ─────────────────────────────────────────────────────── */
  _drawBoardOutline() {
    const { ctx } = this;
    const outline = state.pcb.boardOutline;
    const board   = state.pcb.board;

    // Auto-size board from components if still at default
    if (board && board.x === 0 && board.y === 0 && board.width === 100 && board.height === 80) {
      const comps = Object.values(state.pcb.components);
      if (comps.length > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const c of comps) { minX = Math.min(minX, c.x); minY = Math.min(minY, c.y); maxX = Math.max(maxX, c.x); maxY = Math.max(maxY, c.y); }
        const pad = 8;
        board.x = minX - pad; board.y = minY - pad;
        board.width = (maxX - minX) + pad * 2; board.height = (maxY - minY) + pad * 2;
      }
    }

    // Use explicit outline if set, otherwise derive from board rect
    let points;
    if (outline && outline.length >= 2) {
      points = outline;
    } else if (board) {
      points = [
        { x: board.x, y: board.y },
        { x: board.x + board.width, y: board.y },
        { x: board.x + board.width, y: board.y + board.height },
        { x: board.x, y: board.y + board.height },
      ];
    } else {
      return;
    }

    // Board fill — dark green PCB substrate
    ctx.fillStyle = '#0b2e0b';
    ctx.beginPath();
    const f0 = this.w2s(points[0].x, points[0].y);
    ctx.moveTo(f0.x, f0.y);
    for (let i = 1; i < points.length; i++) {
      const fp = this.w2s(points[i].x, points[i].y);
      ctx.lineTo(fp.x, fp.y);
    }
    ctx.closePath();
    ctx.fill();

    // Board edge — solid bright yellow border
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth   = Math.max(2, 3 * this.zoom);
    ctx.setLineDash([]);
    ctx.beginPath();
    const p0 = this.w2s(points[0].x, points[0].y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < points.length; i++) {
      const p = this.w2s(points[i].x, points[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();

    // Corner markers for extra visibility
    const cornerSize = Math.max(6, 10 * this.zoom);
    ctx.strokeStyle = '#ffcc00';
    ctx.lineWidth   = Math.max(2.5, 3.5 * this.zoom);
    for (const pt of points) {
      const sp = this.w2s(pt.x, pt.y);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, cornerSize, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Board dimension labels
    if (board && this.zoom > 0.2) {
      const bwMM = (board.width * 2.54).toFixed(1);
      const bhMM = (board.height * 2.54).toFixed(1);
      ctx.fillStyle    = '#ffcc00cc';
      ctx.font         = `bold ${Math.max(10, 12 * this.zoom)}px monospace`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'bottom';
      const topMid = this.w2s(board.x + board.width / 2, board.y);
      ctx.fillText(`${bwMM} mm`, topMid.x, topMid.y - 8);
      ctx.save();
      const leftMid = this.w2s(board.x, board.y + board.height / 2);
      ctx.translate(leftMid.x - 12, leftMid.y);
      ctx.rotate(-Math.PI / 2);
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${bhMM} mm`, 0, 0);
      ctx.restore();
      ctx.textBaseline = 'alphabetic';
    }
  }

  /* ── Copper traces (PCB wires) ──────────────────────────────────────── */
  _drawPCBTraces() {
    const { ctx } = this;
    ctx.lineCap = 'round';

    // Draw schematic wires as copper traces in PCB mode
    for (const w of Object.values(state.schematic.wires)) {
      const p1 = this.w2s(w.x1, w.y1), p2 = this.w2s(w.x2, w.y2);
      const layer = w.layer || 'F.Cu';
      ctx.strokeStyle = w.selected ? C.selected : (layer === 'B.Cu' ? C.traceB : C.traceF);
      ctx.lineWidth   = Math.max(3, (w.traceWidth || 0.25) * GRID * this.zoom);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }

    // Draw explicit PCB traces
    for (const t of Object.values(state.pcb.traces)) {
      const p1 = this.w2s(t.x1, t.y1), p2 = this.w2s(t.x2, t.y2);
      ctx.strokeStyle = t.selected ? C.selected : (t.layer === 'B.Cu' ? C.traceB : C.traceF);
      ctx.lineWidth   = Math.max(3, (t.width || 0.25) * GRID * this.zoom);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }
  }

  /* ── PCB Footprint components ──────────────────────────────────────────── */
  _drawPCBComponents() {
    const pcbComps = state.pcb.components;
for (const pcbComp of Object.values(pcbComps)) {
      this._drawFootprint(pcbComp);
    }
  }

  _drawFootprint(pcbComp) {
    const { ctx } = this;
    const z = this.zoom;
    const fp = FOOTPRINT_MAP[pcbComp.footprintId];
    const schComp = state.schematic.components[pcbComp.id];
    const s = this.w2s(pcbComp.x, pcbComp.y);

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate((pcbComp.rotation || 0) * Math.PI / 180);

    // Scale: footprint data is in mm, we convert mm → world grid units → screen px
    // 1 grid unit = 2.54mm, so 1mm = (1/2.54) grid units = (1/2.54)*GRID*zoom screen px
    const mmToPx = (GRID * z) / 2.54;

    if (fp) {
      // ── Courtyard (dashed outline) ─────────────────────────────────────
      if (fp.courtyard && fp.courtyard.length >= 2) {
        ctx.strokeStyle = '#ffff0044';
        ctx.lineWidth   = Math.max(0.5, 0.8 * z);
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(fp.courtyard[0][0] * mmToPx, fp.courtyard[0][1] * mmToPx);
        for (let i = 1; i < fp.courtyard.length; i++) {
          ctx.lineTo(fp.courtyard[i][0] * mmToPx, fp.courtyard[i][1] * mmToPx);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // ── Silkscreen lines ───────────────────────────────────────────────
      if (fp.silkscreen) {
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth   = Math.max(0.8, 1.2 * z);
        for (const line of fp.silkscreen) {
          ctx.beginPath();
          ctx.moveTo(line.x1 * mmToPx, line.y1 * mmToPx);
          ctx.lineTo(line.x2 * mmToPx, line.y2 * mmToPx);
          ctx.stroke();
        }
      }

      // ── Pads with solder mask and drill ──────────────────────────────
      for (const pad of fp.pads) {
        const px = pad.x * mmToPx;
        const py = pad.y * mmToPx;
        const ps = pad.padstack;
        const isTH = ps?.type === 'TH';
        const layer = pcbComp.layer || 'F.Cu';

        // Pad color by layer
        const padColor = layer === 'B.Cu' ? '#3366cc' : '#cc3333';
        const maskColor = layer === 'B.Cu' ? 'rgba(51,102,204,0.25)' : 'rgba(204,51,51,0.25)';

        if (ps?.shape === 'circle' || isTH) {
          // Through-hole circular pad
          const padR = Math.max(3, (ps.width / 2) * mmToPx);
          const drillR = Math.max(1.5, padR * 0.5);
          const maskR = padR + Math.max(1, 0.1 * mmToPx); // solder mask expansion

          // Solder mask ring (slightly larger, translucent)
          ctx.fillStyle = maskColor;
          ctx.beginPath(); ctx.arc(px, py, maskR, 0, Math.PI * 2); ctx.fill();

          // Copper annular ring
          ctx.fillStyle = pcbComp.selected ? C.selected : padColor;
          ctx.beginPath(); ctx.arc(px, py, padR, 0, Math.PI * 2); ctx.fill();

          // Drill hole (dark center)
          ctx.fillStyle = '#1a1a1a';
          ctx.beginPath(); ctx.arc(px, py, drillR, 0, Math.PI * 2); ctx.fill();

          // Drill hole border
          ctx.strokeStyle = '#333';
          ctx.lineWidth = Math.max(0.5, 0.8 * z);
          ctx.beginPath(); ctx.arc(px, py, drillR, 0, Math.PI * 2); ctx.stroke();
        } else {
          // SMD rectangular pad
          const pw = Math.max(4, (ps?.width  || 1.4) * mmToPx);
          const ph = Math.max(3, (ps?.height || 1.0) * mmToPx);
          const maskExp = Math.max(1, 0.1 * mmToPx);

          // Solder mask (slightly larger)
          ctx.fillStyle = maskColor;
          const rr2 = Math.min(pw + maskExp*2, ph + maskExp*2) * 0.15;
          ctx.beginPath();
          ctx.roundRect(px - pw/2 - maskExp, py - ph/2 - maskExp, pw + maskExp*2, ph + maskExp*2, rr2);
          ctx.fill();

          // Copper pad
          ctx.fillStyle = pcbComp.selected ? C.selected : padColor;
          const rr = Math.min(pw, ph) * 0.15;
          ctx.beginPath();
          ctx.roundRect(px - pw/2, py - ph/2, pw, ph, rr);
          ctx.fill();
        }

        // Pad number label
        if (z > 0.4) {
          ctx.fillStyle    = isTH ? '#cccccc' : '#ffffff';
          ctx.font         = `bold ${Math.max(6, 7 * z)}px monospace`;
          ctx.textAlign    = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(pad.number), px, py);
          ctx.textBaseline = 'alphabetic';
        }
      }
    } else {
      // No footprint data — draw generic footprint based on pin count
      const pinCount = schComp?.pins?.length || 2;
      const half = Math.ceil(pinCount / 2);
      const pitch = 2.54;
      const totalH = (half - 1) * pitch;
      const hW = 4 * mmToPx;
      const hH = (totalH / 2 + 2) * mmToPx;

      // Silkscreen outline
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth   = Math.max(1, 1.5 * z);
      ctx.strokeRect(-hW, -hH, hW * 2, hH * 2);

      // Draw TH pads for each pin
      const padR = Math.max(3, 0.5 * mmToPx);
      const drillR = Math.max(1.5, padR * 0.5);
      for (let i = 0; i < half; i++) {
        const py = (-totalH / 2 + i * pitch) * mmToPx;
        // Left column
        ctx.fillStyle = pcbComp.selected ? C.selected : '#cc3333';
        ctx.beginPath(); ctx.arc(-3 * mmToPx, py, padR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(-3 * mmToPx, py, drillR, 0, Math.PI * 2); ctx.fill();
      }
      for (let i = 0; i < pinCount - half; i++) {
        const py = (totalH / 2 - i * pitch) * mmToPx;
        // Right column
        ctx.fillStyle = pcbComp.selected ? C.selected : '#cc3333';
        ctx.beginPath(); ctx.arc(3 * mmToPx, py, padR, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1a1a1a';
        ctx.beginPath(); ctx.arc(3 * mmToPx, py, drillR, 0, Math.PI * 2); ctx.fill();
      }
    }

    // ── Component reference label ──────────────────────────────────────
    const label = schComp?.partName || pcbComp.id;
    const valLabel = schComp?.value || '';
    ctx.fillStyle    = '#e0e0e0';
    ctx.font         = `bold ${Math.max(7, 8 * z)}px monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';

    // Position label above the footprint
    const fpHeight = fp?.courtyard
      ? Math.max(...fp.courtyard.map(c => Math.abs(c[1]))) * mmToPx
      : 14 * z;
    ctx.fillText(label, 0, -(fpHeight + 4 * z));
    if (valLabel) {
      ctx.fillStyle = '#888888';
      ctx.font      = `${Math.max(6, 7 * z)}px monospace`;
      ctx.fillText(valLabel, 0, fpHeight + 10 * z);
    }

    ctx.restore();
  }

  /* ── Drop helper ────────────────────────────────────────────────────────── */
  getCanvasDropPoint(cx, cy) {
    const rect = this.canvas.getBoundingClientRect();
    const w = this.s2w(cx - rect.left, cy - rect.top);
    return this.snap(w.x, w.y);
  }
}

function _segDistWorld(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx*dx + dy*dy;
  if (lenSq === 0) return Math.hypot(px-x1, py-y1);
  const t = Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy) / lenSq));
  return Math.hypot(px-(x1+t*dx), py-(y1+t*dy));
}
