/**
 * AltiEDA – Component Library & Footprint Editor
 *
 * Two modes: 'symbol' (schematic symbol) | 'footprint' (PCB footprint)
 * exportComponentPackage(symbolData, footprintData, metadata) → unified JSON
 */
import { PinType, createPadstack } from '../core/dataModels.js';

// ── Grid precision ─────────────────────────────────────────────────────────────
const SYMBOL_GRID  = 10;   // px per schematic unit
const FP_GRID_MM   = 0.05; // mm per footprint grid snap

// ── Symbol Editor ─────────────────────────────────────────────────────────────
export class SymbolEditor {
  constructor(canvasEl) {
    this.canvas    = canvasEl;
    this.ctx       = canvasEl.getContext('2d');
    this.tool      = 'select';  // 'select' | 'line' | 'rect' | 'circle' | 'pin'
    this.primitives = [];        // drawn shapes
    this.pins       = [];        // electrical pins
    this._drawing   = false;
    this._start     = null;
    this._zoom      = 1;
    this._offset    = { x: 200, y: 200 };

    this._bind();
  }

  _bind() {
    this.canvas.addEventListener('mousedown', e => this._onDown(e));
    this.canvas.addEventListener('mousemove', e => this._onMove(e));
    this.canvas.addEventListener('mouseup',   e => this._onUp(e));
  }

  screenToGrid(sx, sy) {
    return {
      x: Math.round((sx - this._offset.x) / (SYMBOL_GRID * this._zoom)),
      y: Math.round((sy - this._offset.y) / (SYMBOL_GRID * this._zoom)),
    };
  }

  worldToScreen(gx, gy) {
    return {
      x: gx * SYMBOL_GRID * this._zoom + this._offset.x,
      y: gy * SYMBOL_GRID * this._zoom + this._offset.y,
    };
  }

  _onDown(e) {
    const pt = this.screenToGrid(e.offsetX, e.offsetY);
    this._drawing = true;
    this._start   = pt;

    if (this.tool === 'pin') {
      this._placePinDialog(pt);
    }
  }

  _onMove(e) {
    if (!this._drawing) return;
    this._preview = this.screenToGrid(e.offsetX, e.offsetY);
    this.render();
  }

  _onUp(e) {
    if (!this._drawing || !this._start) return;
    const end = this.screenToGrid(e.offsetX, e.offsetY);
    if (this.tool !== 'pin') {
      this.primitives.push({
        type:  this.tool,
        x1:    this._start.x, y1: this._start.y,
        x2:    end.x,         y2: end.y,
        color: '#88aaff',
        width: 1,
      });
    }
    this._drawing = false;
    this._preview = null;
    this.render();
  }

  _placePinDialog(pt) {
    const num  = parseInt(prompt('Pin number:', (this.pins.length + 1).toString()), 10);
    const name = prompt('Pin name:', 'PIN');
    const typeStr = prompt(`Pin type (${Object.keys(PinType).join('/')}):`, 'PASSIVE');
    const type = PinType[typeStr?.toUpperCase()] ?? PinType.PASSIVE;
    if (!name) return;
    this.pins.push({ number: num, name, type, x: pt.x, y: pt.y });
    this.render();
  }

  render() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this._drawGrid();

    // Primitives
    for (const prim of this.primitives) {
      const p1 = this.worldToScreen(prim.x1, prim.y1);
      const p2 = this.worldToScreen(prim.x2, prim.y2);
      ctx.strokeStyle = prim.color;
      ctx.lineWidth   = prim.width;
      ctx.beginPath();
      if (prim.type === 'line') {
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
      } else if (prim.type === 'rect') {
        ctx.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      } else if (prim.type === 'circle') {
        const r = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2);
      }
      ctx.stroke();
    }

    // Pins
    for (const pin of this.pins) {
      const ps = this.worldToScreen(pin.x, pin.y);
      ctx.fillStyle   = '#88aaff';
      ctx.strokeStyle = '#4488cc';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(ps.x, ps.y, 4 * this._zoom, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font      = `${10 * this._zoom}px monospace`;
      ctx.fillText(`${pin.number}:${pin.name}`, ps.x + 6, ps.y + 4);
    }

    // Preview
    if (this._drawing && this._preview && this.tool !== 'pin') {
      const p1 = this.worldToScreen(this._start.x, this._start.y);
      const p2 = this.worldToScreen(this._preview.x, this._preview.y);
      ctx.strokeStyle = '#ffffff';
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      if (this.tool === 'line') { ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); }
      else if (this.tool === 'rect') { ctx.rect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y); }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  _drawGrid() {
    const { ctx, canvas } = this;
    const step = SYMBOL_GRID * this._zoom;
    ctx.strokeStyle = '#1e2040';
    ctx.lineWidth   = 0.5;
    for (let x = this._offset.x % step; x < canvas.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = this._offset.y % step; y < canvas.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }

  toJSON() {
    return { primitives: this.primitives, pins: this.pins };
  }
}

// ── Footprint Editor ──────────────────────────────────────────────────────────
export class FootprintEditor {
  constructor(canvasEl) {
    this.canvas    = canvasEl;
    this.ctx       = canvasEl.getContext('2d');
    this.pads      = [];        // pad objects
    this.courtyard = [];        // [{x,y}] polygon points
    this.silkscreen = [];       // [{x1,y1,x2,y2}] line segments
    this.tool       = 'smd';    // 'smd' | 'th' | 'courtyard' | 'silk'
    this._zoom      = 30;       // px per mm
    this._offset    = { x: 300, y: 300 };
    this._drawing   = false;
    this._start     = null;

    this._bind();
  }

  // mm → canvas
  mmToScreen(mx, my) {
    return {
      x: mx * this._zoom + this._offset.x,
      y: my * this._zoom + this._offset.y,
    };
  }

  screenToMM(sx, sy) {
    const raw = {
      x: (sx - this._offset.x) / this._zoom,
      y: (sy - this._offset.y) / this._zoom,
    };
    return {
      x: Math.round(raw.x / FP_GRID_MM) * FP_GRID_MM,
      y: Math.round(raw.y / FP_GRID_MM) * FP_GRID_MM,
    };
  }

  _bind() {
    this.canvas.addEventListener('mousedown', e => this._onDown(e));
    this.canvas.addEventListener('mousemove', e => this._onMove(e));
    this.canvas.addEventListener('mouseup',   e => this._onUp(e));
  }

  _onDown(e) {
    const pt = this.screenToMM(e.offsetX, e.offsetY);
    this._drawing = true;
    this._start   = pt;

    if (this.tool === 'smd')  this._placeSMDPad(pt);
    if (this.tool === 'th')   this._placeTHPad(pt);
    if (this.tool === 'courtyard') this.courtyard.push(pt);
  }

  _onMove(e) {
    this._preview = this.screenToMM(e.offsetX, e.offsetY);
    this.render();
  }

  _onUp(e) {
    const end = this.screenToMM(e.offsetX, e.offsetY);
    if (this.tool === 'silk' && this._drawing && this._start) {
      this.silkscreen.push({ x1: this._start.x, y1: this._start.y, x2: end.x, y2: end.y });
    }
    this._drawing = false;
    this.render();
  }

  _placeSMDPad(pt) {
    const w = parseFloat(prompt('Pad width (mm):', '1.6') || '1.6');
    const h = parseFloat(prompt('Pad height (mm):', '0.9') || '0.9');
    const num = this.pads.length + 1;
    this.pads.push({
      number:   num,
      x:        pt.x,
      y:        pt.y,
      padstack: createPadstack('SMD', 'rect', w, h),
    });
    this.render();
  }

  _placeTHPad(pt) {
    const drill  = parseFloat(prompt('Drill diameter (mm):', '0.8') || '0.8');
    const pad    = parseFloat(prompt('Pad diameter (mm):', '1.6') || '1.6');
    const num    = this.pads.length + 1;
    this.pads.push({
      number:   num,
      x:        pt.x,
      y:        pt.y,
      padstack: { ...createPadstack('TH', 'circle', pad, pad), drillDiameter: drill },
    });
    this.render();
  }

  render() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this._drawFPGrid();

    // Courtyard
    if (this.courtyard.length > 1) {
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      const first = this.mmToScreen(this.courtyard[0].x, this.courtyard[0].y);
      ctx.moveTo(first.x, first.y);
      this.courtyard.slice(1).forEach(pt => {
        const s = this.mmToScreen(pt.x, pt.y);
        ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Silkscreen
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1;
    for (const seg of this.silkscreen) {
      const p1 = this.mmToScreen(seg.x1, seg.y1);
      const p2 = this.mmToScreen(seg.x2, seg.y2);
      ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    }

    // Pads
    for (const pad of this.pads) {
      const ps   = this.mmToScreen(pad.x, pad.y);
      const isTH = pad.padstack.type === 'TH';
      const pw   = (pad.padstack.width  ?? pad.padstack.drillDiameter) * this._zoom;
      const ph   = (pad.padstack.height ?? pad.padstack.drillDiameter) * this._zoom;

      ctx.fillStyle   = '#c87533';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 1;
      if (isTH) {
        ctx.beginPath();
        ctx.arc(ps.x, ps.y, pw / 2, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // Drill hole
        ctx.fillStyle = '#0d0d1a';
        ctx.beginPath();
        ctx.arc(ps.x, ps.y, (pad.padstack.drillDiameter * this._zoom) / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(ps.x - pw / 2, ps.y - ph / 2, pw, ph);
        ctx.strokeRect(ps.x - pw / 2, ps.y - ph / 2, pw, ph);
      }

      // Number
      ctx.fillStyle = '#ffffff';
      ctx.font      = `${Math.max(8, 8 * (this._zoom / 30))}px monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(pad.number, ps.x, ps.y + 4);

      // Solder mask expansion outline
      const exp = (pad.padstack.soldermaskExpansion ?? 0.1) * this._zoom;
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth   = 0.5;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(ps.x - pw / 2 - exp, ps.y - ph / 2 - exp, pw + exp * 2, ph + exp * 2);
      ctx.setLineDash([]);
    }

    // Crosshair origin
    const o = this.mmToScreen(0, 0);
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth   = 0.8;
    ctx.beginPath();
    ctx.moveTo(o.x - 8, o.y); ctx.lineTo(o.x + 8, o.y);
    ctx.moveTo(o.x, o.y - 8); ctx.lineTo(o.x, o.y + 8);
    ctx.stroke();

    // Cursor coordinates
    if (this._preview) {
      ctx.fillStyle = '#aaaaaa';
      ctx.font      = '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`X:${this._preview.x.toFixed(2)} Y:${this._preview.y.toFixed(2)} mm`, 5, 15);
    }
  }

  _drawFPGrid() {
    const { ctx, canvas } = this;
    const step = FP_GRID_MM * this._zoom;
    ctx.strokeStyle = '#1e2040';
    ctx.lineWidth   = 0.3;
    for (let x = this._offset.x % step; x < canvas.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = this._offset.y % step; y < canvas.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    // Major grid (every 1mm)
    const major = this._zoom;
    ctx.strokeStyle = '#2a2d50';
    ctx.lineWidth   = 0.6;
    for (let x = this._offset.x % major; x < canvas.width; x += major) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = this._offset.y % major; y < canvas.height; y += major) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
  }

  toJSON() {
    return {
      pads:       this.pads,
      courtyard:  this.courtyard,
      silkscreen: this.silkscreen,
    };
  }
}

// ── Export component package ──────────────────────────────────────────────────
export function exportComponentPackage(symbolData, footprintData, metadata = {}) {
  // Link schematic pins → footprint pads by pin number
  const pinPadMap = {};
  for (const pin of symbolData.pins) {
    const pad = footprintData.pads.find(p => p.number === pin.number);
    pinPadMap[pin.number] = {
      pinName:   pin.name,
      pinType:   pin.type,
      padNumber: pad?.number ?? null,
      padX:      pad?.x ?? null,
      padY:      pad?.y ?? null,
      padstack:  pad?.padstack ?? null,
    };
  }

  const pkg = {
    version:      '1.0',
    partId:       metadata.partId   ?? `CUSTOM_${Date.now()}`,
    partName:     metadata.partName ?? 'Custom Component',
    category:     metadata.category ?? 'Custom',
    defaultValue: metadata.value    ?? '',
    description:  metadata.description ?? '',
    author:       metadata.author   ?? 'AltiEDA User',
    created:      new Date().toISOString(),
    symbol: {
      primitives: symbolData.primitives,
      pins:       symbolData.pins,
    },
    footprint: {
      pads:       footprintData.pads,
      courtyard:  footprintData.courtyard,
      silkscreen: footprintData.silkscreen,
    },
    pinPadMap,
    spiceModel: metadata.spiceModel ?? null,
  };

  // Trigger download
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${pkg.partId}.altieda.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return pkg;
}
