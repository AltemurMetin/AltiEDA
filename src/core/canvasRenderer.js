/**
 * AltiEDA – Canvas Renderer
 * Handles grid, pan/zoom, component drawing, wires, suggestions,
 * DRC overlays, and PCB ratsnest.
 */
import { state } from './schematicState.js';
import { NetClass } from './dataModels.js';

// ── Colour palette ────────────────────────────────────────────────────────────
const COLORS = {
  grid:        '#1e2040',
  gridMajor:   '#2a2d50',
  component:   '#334466',
  compBorder:  '#4488cc',
  compText:    '#e0e0e0',
  pin:         '#88aaff',
  wire:        '#aaddff',
  wireHighlight:'#ffffff',
  junction:    '#ffff00',
  suggestion:  {
    [NetClass.GND]:    '#4caf50',
    [NetClass.POWER]:  '#f44336',
    [NetClass.I2C]:    '#2196f3',
    [NetClass.SPI]:    '#9c27b0',
    [NetClass.UART]:   '#ff5722',
    [NetClass.PWM]:    '#ffc107',
    [NetClass.SIGNAL]: '#aaaaaa',
  },
  ratsnest:    '#ff8800',
  drcViolation:'#ff2222',
  probe:       '#00e5ff',
  via:         '#c0a060',
  selected:    '#ff9900',
};

const GRID_SIZE = 10;    // px at zoom=1 (represents ~2.54mm)
const PIN_RADIUS = 4;

export class CanvasRenderer {
  constructor(canvasEl) {
    this.canvas  = canvasEl;
    this.ctx     = canvasEl.getContext('2d');
    this.offsetX = 0;
    this.offsetY = 0;
    this.zoom    = 1;
    this.drcViolations = [];
    this.suggestions   = [];   // [{x,y,netClass,label}]
    this._animFrame    = null;
    this._drcFlash     = false;
    this._flashTimer   = null;

    this._resize();
    window.addEventListener('resize', () => this._resize());

    // Start flash animation for DRC markers
    setInterval(() => {
      this._drcFlash = !this._drcFlash;
      if (this.drcViolations.length) this.render();
    }, 500);
  }

  _resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width  = rect.width;
    this.canvas.height = rect.height;
    this.render();
  }

  // ── Coordinate helpers ────────────────────────────────────────────────────
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.offsetX) / (GRID_SIZE * this.zoom),
      y: (sy - this.offsetY) / (GRID_SIZE * this.zoom),
    };
  }

  worldToScreen(wx, wy) {
    return {
      x: wx * GRID_SIZE * this.zoom + this.offsetX,
      y: wy * GRID_SIZE * this.zoom + this.offsetY,
    };
  }

  snapToGrid(worldX, worldY) {
    return {
      x: Math.round(worldX),
      y: Math.round(worldY),
    };
  }

  // ── Pan / Zoom ────────────────────────────────────────────────────────────
  pan(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
    this.render();
  }

  zoomAt(screenX, screenY, factor) {
    const before = this.screenToWorld(screenX, screenY);
    this.zoom = Math.max(0.1, Math.min(10, this.zoom * factor));
    const after = this.worldToScreen(before.x, before.y);
    this.offsetX += screenX - after.x;
    this.offsetY += screenY - after.y;
    this.render();
  }

  // ── Main render ───────────────────────────────────────────────────────────
  render() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._animFrame = requestAnimationFrame(() => this._draw());
  }

  _draw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this._drawGrid();
    this._drawWires();
    this._drawComponents();
    this._drawJunctions();
    this._drawVias();
    this._drawProbes();
    this._drawSuggestions();
    this._drawRatsnest();
    this._drawDRCOverlays();
  }

  // ── Grid ──────────────────────────────────────────────────────────────────
  _drawGrid() {
    const { ctx, canvas, zoom, offsetX, offsetY } = this;
    const step = GRID_SIZE * zoom;
    const majorEvery = 10;

    const startX = ((offsetX % (step * majorEvery)) + (step * majorEvery)) % (step * majorEvery);
    const startY = ((offsetY % (step * majorEvery)) + (step * majorEvery)) % (step * majorEvery);

    ctx.lineWidth = 0.5;
    for (let x = startX - step * majorEvery; x < canvas.width; x += step) {
      const isMajor = Math.abs(Math.round((x - startX) / step) % majorEvery) === 0;
      ctx.strokeStyle = isMajor ? COLORS.gridMajor : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = startY - step * majorEvery; y < canvas.height; y += step) {
      const isMajor = Math.abs(Math.round((y - startY) / step) % majorEvery) === 0;
      ctx.strokeStyle = isMajor ? COLORS.gridMajor : COLORS.grid;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }

  // ── Wires ─────────────────────────────────────────────────────────────────
  _drawWires() {
    const { ctx } = this;
    ctx.lineWidth   = 1.5;
    ctx.strokeStyle = COLORS.wire;
    for (const wire of Object.values(state.schematic.wires)) {
      const p1 = this.worldToScreen(wire.x1, wire.y1);
      const p2 = this.worldToScreen(wire.x2, wire.y2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    // PCB traces
    for (const trace of Object.values(state.pcb.traces)) {
      const p1 = this.worldToScreen(trace.x1, trace.y1);
      const p2 = this.worldToScreen(trace.x2, trace.y2);
      const w  = trace.width * GRID_SIZE * this.zoom;
      ctx.lineWidth   = Math.max(1, w);
      ctx.strokeStyle = trace.layer === 'F.Cu' ? '#c87533' : '#3388ff';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.lineWidth = 1;
  }

  // ── Components ────────────────────────────────────────────────────────────
  _drawComponents() {
    for (const comp of Object.values(state.schematic.components)) {
      this._drawComponent(comp);
    }
  }

  _drawComponent(comp) {
    const { ctx } = this;
    const s = this.worldToScreen(comp.x, comp.y);
    const W = 80 * this.zoom;
    const H = 120 * this.zoom;
    const hw = W / 2, hh = H / 2;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate((comp.rotation * Math.PI) / 180);

    // Body
    ctx.fillStyle   = comp.selected ? '#334477' : COLORS.component;
    ctx.strokeStyle = comp.selected ? COLORS.selected : COLORS.compBorder;
    ctx.lineWidth   = comp.selected ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, W, H, 4 * this.zoom);
    ctx.fill();
    ctx.stroke();

    // Name
    ctx.fillStyle  = COLORS.compText;
    ctx.font       = `bold ${Math.max(8, 10 * this.zoom)}px monospace`;
    ctx.textAlign  = 'center';
    ctx.fillText(comp.partName.substring(0, 10), 0, -hh + 14 * this.zoom);

    // Value / ID
    ctx.fillStyle = '#88aacc';
    ctx.font      = `${Math.max(7, 8 * this.zoom)}px monospace`;
    ctx.fillText(comp.value || comp.id, 0, -hh + 26 * this.zoom);

    // Pins
    this._drawPins(comp, W, H);

    ctx.restore();
  }

  _drawPins(comp, W, H) {
    const { ctx, zoom } = this;
    const pinSpacingY = (H - 30 * zoom) / Math.max(comp.pins.length, 1);
    const leftPins  = comp.pins.filter((_, i) => i % 2 === 0);
    const rightPins = comp.pins.filter((_, i) => i % 2 === 1);
    const hw = W / 2, hh = H / 2;

    const drawPin = (pin, x, y, side) => {
      const lineLen = 12 * zoom;
      const endX    = side === 'left' ? x - lineLen : x + lineLen;
      ctx.strokeStyle = pin.connected ? COLORS.suggestion[NetClass.SIGNAL] : COLORS.pin;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(endX, y);
      ctx.stroke();

      ctx.fillStyle = pin.connected ? '#88ff88' : COLORS.pin;
      ctx.beginPath();
      ctx.arc(endX, y, PIN_RADIUS * zoom * 0.6, 0, Math.PI * 2);
      ctx.fill();

      // Pin label
      ctx.fillStyle = COLORS.compText;
      ctx.font      = `${Math.max(6, 7 * zoom)}px monospace`;
      ctx.textAlign = side === 'left' ? 'left' : 'right';
      ctx.fillText(pin.name, side === 'left' ? x + 2 : x - 2, y + 4 * zoom);
    };

    leftPins.forEach((pin, i) => {
      const y = -hh + 30 * zoom + i * (pinSpacingY * 2);
      drawPin(pin, -hw, y, 'left');
    });
    rightPins.forEach((pin, i) => {
      const y = -hh + 30 * zoom + i * (pinSpacingY * 2);
      drawPin(pin, hw, y, 'right');
    });
  }

  // ── Junctions ─────────────────────────────────────────────────────────────
  _drawJunctions() {
    const { ctx } = this;
    ctx.fillStyle = COLORS.junction;
    for (const junc of state.schematic.junctions) {
      const s = this.worldToScreen(junc.x, junc.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4 * this.zoom, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Vias ──────────────────────────────────────────────────────────────────
  _drawVias() {
    const { ctx } = this;
    for (const via of Object.values(state.pcb.vias)) {
      const s   = this.worldToScreen(via.x, via.y);
      const r   = (via.padDiameter / 2) * GRID_SIZE * this.zoom;
      const dr  = (via.drillDiameter / 2) * GRID_SIZE * this.zoom;
      ctx.fillStyle   = COLORS.via;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0d0d1a';
      ctx.beginPath();
      ctx.arc(s.x, s.y, dr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Probes ────────────────────────────────────────────────────────────────
  _drawProbes() {
    const { ctx } = this;
    for (const probe of Object.values(state.schematic.probes)) {
      const s = this.worldToScreen(probe.x, probe.y);
      ctx.strokeStyle = COLORS.probe;
      ctx.fillStyle   = 'rgba(0,229,255,0.15)';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8 * this.zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Label
      ctx.fillStyle = COLORS.probe;
      ctx.font      = `bold ${Math.max(8, 9 * this.zoom)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(probe.probeType[0].toUpperCase(), s.x, s.y + 4 * this.zoom);
    }
  }

  // ── AI Suggestions ────────────────────────────────────────────────────────
  _drawSuggestions() {
    const { ctx } = this;
    for (const sug of this.suggestions) {
      const p1 = this.worldToScreen(sug.fromX, sug.fromY);
      const p2 = this.worldToScreen(sug.toX, sug.toY);
      const col = COLORS.suggestion[sug.netClass] ?? '#aaaaaa';

      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = col;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      // Label at midpoint
      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      ctx.fillStyle = col;
      ctx.font      = `${Math.max(8, 9 * this.zoom)}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(sug.label, mx, my - 6);
    }
  }

  // ── Ratsnest (unrouted PCB connections) ───────────────────────────────────
  _drawRatsnest() {
    const { ctx } = this;
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = COLORS.ratsnest;
    ctx.lineWidth   = 0.8;
    ctx.globalAlpha = 0.6;
    for (const rn of state.pcb.ratsnest) {
      const p1 = this.worldToScreen(rn.x1, rn.y1);
      const p2 = this.worldToScreen(rn.x2, rn.y2);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  // ── DRC violation overlays ────────────────────────────────────────────────
  _drawDRCOverlays() {
    if (!this.drcViolations.length) return;
    const { ctx } = this;
    ctx.strokeStyle = COLORS.drcViolation;
    ctx.lineWidth   = 2;
    ctx.globalAlpha = this._drcFlash ? 0.9 : 0.4;
    for (const v of this.drcViolations) {
      if (v.x == null) continue;
      const s = this.worldToScreen(v.x, v.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 12 * this.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // ── Drop component onto canvas ────────────────────────────────────────────
  getCanvasDropPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return this.snapToGrid(
      this.screenToWorld(clientX - rect.left, clientY - rect.top).x,
      this.screenToWorld(clientX - rect.left, clientY - rect.top).y
    );
  }
}
