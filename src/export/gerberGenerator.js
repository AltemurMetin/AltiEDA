/**
 * AltiEDA – Gerber RS-274X & Excellon Drill File Generator
 * Translates PCB JSON state → manufacturing text formats.
 */
import { state }         from '../core/schematicState.js';
import { FOOTPRINT_MAP } from '../core/footprintLibrary.js';

// Scale: 1 world unit = 0.1 mm → Gerber uses mm with 4 decimal places
const mmPerUnit = 0.1;
const fmt = v => (v * mmPerUnit).toFixed(4);

// ── Gerber header ─────────────────────────────────────────────────────────────
function gerberHeader(layer) {
  return [
    '%FSLAX46Y46*%',          // format spec: absolute, X4.6 Y4.6
    '%MOMM*%',                // metric units
    `%LN${layer}*%`,          // layer name
    '%ADD10C,0.20*%',         // aperture D10: circular 0.2mm (trace)
    '%ADD11R,1.6X0.9*%',      // aperture D11: rect SMD pad
    '%ADD12O,0.8*%',          // aperture D12: oblong via pad
    'G75*',                   // multi-quadrant arc mode
    'G01*',                   // linear interpolation mode
  ].join('\n');
}

// ── Gerber footer ─────────────────────────────────────────────────────────────
const gerberFooter = 'M02*';

// ── Scale world → Gerber integer coordinates ──────────────────────────────────
function gx(v) { return Math.round(v * mmPerUnit * 1e6); }   // units: nm (X4.6 format)
function gy(v) { return Math.round(v * mmPerUnit * 1e6); }

// ── Generate Top Copper Gerber ────────────────────────────────────────────────
export function generateTopCopperGerber() {
  const lines = [gerberHeader('TopCopper'), ''];

  // Flash pads for top-layer footprints
  for (const pcbComp of Object.values(state.pcb.components)) {
    if (pcbComp.layer !== 'F.Cu' && pcbComp.layer !== 'TOP') continue;
    const fp = FOOTPRINT_MAP[pcbComp.footprintId];
    if (!fp) continue;
    for (const pad of fp.pads) {
      if (!pad.padstack.layers.includes('F.Cu') &&
          !pad.padstack.layers.includes('*.Cu')) continue;
      const px = pcbComp.x + pad.x / mmPerUnit;
      const py = pcbComp.y + pad.y / mmPerUnit;
      lines.push(`D11*`);                              // select SMD rect aperture
      lines.push(`X${gx(px)}Y${gy(py)}D03*`);         // flash (D03 = flash)
    }
  }

  // Draw traces
  for (const trace of Object.values(state.pcb.traces)) {
    if (trace.layer !== 'F.Cu') continue;
    const w = (trace.width / mmPerUnit).toFixed(4);
    // Select custom aperture for width – simplified: use D10
    lines.push(`D10*`);
    lines.push(`X${gx(trace.x1)}Y${gy(trace.y1)}D02*`);  // move
    lines.push(`X${gx(trace.x2)}Y${gy(trace.y2)}D01*`);  // draw
  }

  // Via pads on top copper
  for (const via of Object.values(state.pcb.vias)) {
    const vx = via.x, vy = via.y;
    lines.push(`D12*`);
    lines.push(`X${gx(vx)}Y${gy(vy)}D03*`);
  }

  // Board edge (Edge.Cuts) as outline polygon – simplified rectangle
  const { x, y, width, height } = state.pcb.board;
  const bx = x / mmPerUnit, by = y / mmPerUnit;
  const bw = width / mmPerUnit, bh = height / mmPerUnit;
  lines.push('%ADD13C,0.05*%');  // thin outline aperture
  lines.push('D13*');
  lines.push(`X${gx(bx)}Y${gy(by)}D02*`);
  lines.push(`X${gx(bx + bw)}Y${gy(by)}D01*`);
  lines.push(`X${gx(bx + bw)}Y${gy(by + bh)}D01*`);
  lines.push(`X${gx(bx)}Y${gy(by + bh)}D01*`);
  lines.push(`X${gx(bx)}Y${gy(by)}D01*`);

  lines.push('', gerberFooter);
  return lines.join('\n');
}

// ── Generate Bottom Copper Gerber ─────────────────────────────────────────────
export function generateBottomCopperGerber() {
  const lines = [gerberHeader('BottomCopper'), ''];

  for (const pcbComp of Object.values(state.pcb.components)) {
    if (pcbComp.layer !== 'B.Cu' && pcbComp.layer !== 'BOTTOM') continue;
    const fp = FOOTPRINT_MAP[pcbComp.footprintId];
    if (!fp) continue;
    for (const pad of fp.pads) {
      if (!pad.padstack.layers.includes('B.Cu') &&
          !pad.padstack.layers.includes('*.Cu')) continue;
      const px = pcbComp.x + pad.x / mmPerUnit;
      const py = pcbComp.y + pad.y / mmPerUnit;
      lines.push(`D11*`);
      lines.push(`X${gx(px)}Y${gy(py)}D03*`);
    }
  }

  for (const trace of Object.values(state.pcb.traces)) {
    if (trace.layer !== 'B.Cu') continue;
    lines.push(`D10*`);
    lines.push(`X${gx(trace.x1)}Y${gy(trace.y1)}D02*`);
    lines.push(`X${gx(trace.x2)}Y${gy(trace.y2)}D01*`);
  }

  lines.push('', gerberFooter);
  return lines.join('\n');
}

// ── Generate Silkscreen Gerber ────────────────────────────────────────────────
export function generateSilkscreenGerber() {
  const lines = [gerberHeader('FrontSilkscreen'), ''];
  lines.push('%ADD20C,0.12*%');  // thin silkscreen line

  for (const pcbComp of Object.values(state.pcb.components)) {
    const fp = FOOTPRINT_MAP[pcbComp.footprintId];
    if (!fp) continue;
    for (const seg of fp.silkscreen) {
      const x1 = pcbComp.x + seg.x1 / mmPerUnit;
      const y1 = pcbComp.y + seg.y1 / mmPerUnit;
      const x2 = pcbComp.x + seg.x2 / mmPerUnit;
      const y2 = pcbComp.y + seg.y2 / mmPerUnit;
      lines.push('D20*');
      lines.push(`X${gx(x1)}Y${gy(y1)}D02*`);
      lines.push(`X${gx(x2)}Y${gy(y2)}D01*`);
    }
  }

  lines.push('', gerberFooter);
  return lines.join('\n');
}

// ── Excellon Drill File ───────────────────────────────────────────────────────
export function generateExcellonDrillFile() {
  const tools  = {};  // diameter → tool number
  const holes  = [];

  // Collect through-hole pads
  for (const pcbComp of Object.values(state.pcb.components)) {
    const fp = FOOTPRINT_MAP[pcbComp.footprintId];
    if (!fp) continue;
    for (const pad of fp.pads) {
      if (pad.padstack.type !== 'TH') continue;
      const d = pad.padstack.drillDiameter ?? 0.8;
      if (!tools[d]) tools[d] = Object.keys(tools).length + 1;
      const px = (pcbComp.x + pad.x / mmPerUnit) * mmPerUnit;
      const py = (pcbComp.y + pad.y / mmPerUnit) * mmPerUnit;
      holes.push({ d, x: px, y: py });
    }
  }

  // Collect vias
  for (const via of Object.values(state.pcb.vias)) {
    const d = via.drillDiameter;
    if (!tools[d]) tools[d] = Object.keys(tools).length + 1;
    holes.push({ d, x: via.x * mmPerUnit, y: via.y * mmPerUnit });
  }

  const lines = [
    'M48',                      // header
    'FMAT,2',                   // format 2
    'METRIC,TZ',                // metric, trailing zeros
  ];

  for (const [dia, tn] of Object.entries(tools)) {
    lines.push(`T${tn}C${parseFloat(dia).toFixed(3)}`);
  }

  lines.push('%', 'G90', 'G05', 'M72');  // absolute, drill mode, metric

  // Group holes by tool
  const byTool = {};
  holes.forEach(h => {
    const tn = tools[h.d];
    (byTool[tn] = byTool[tn] ?? []).push(h);
  });

  for (const [tn, hs] of Object.entries(byTool)) {
    lines.push(`T${tn}`);
    hs.forEach(h => {
      const xi = Math.round(h.x * 1000);
      const yi = Math.round(h.y * 1000);
      lines.push(`X${xi}Y${yi}`);
    });
  }

  lines.push('T00', 'M30');  // end
  return lines.join('\n');
}

// ── #11 Solder Mask Gerber ────────────────────────────────────────────────────
export function generateSolderMaskGerber(side = 'top') {
  const layerName = side === 'top' ? 'TopSolderMask' : 'BottomSolderMask';
  const filterLayer = side === 'top' ? 'F.Cu' : 'B.Cu';
  const lines = [gerberHeader(layerName), ''];
  const maskExpansion = 0.1; // mm expansion around pads

  // Solder mask openings = everywhere there's a pad (inverse logic in manufacturing)
  for (const pcbComp of Object.values(state.pcb.components)) {
    if (pcbComp.layer !== filterLayer && pcbComp.layer !== (side === 'top' ? 'TOP' : 'BOTTOM')) continue;
    const fp = FOOTPRINT_MAP[pcbComp.footprintId];
    if (!fp) continue;
    for (const pad of fp.pads) {
      const px = pcbComp.x + pad.x / 2.54;
      const py = pcbComp.y + pad.y / 2.54;
      // Flash pad-sized opening with mask expansion
      lines.push('D11*');
      lines.push(`X${gx(px)}Y${gy(py)}D03*`);
    }
  }

  // Via openings
  for (const via of Object.values(state.pcb.vias)) {
    lines.push('D12*');
    lines.push(`X${gx(via.x)}Y${gy(via.y)}D03*`);
  }

  lines.push(gerberFooter);
  return lines.join('\n');
}

// ── Solder Paste Gerber ──────────────────────────────────────────────────────
export function generateSolderPasteGerber(side = 'top') {
  const layerName = side === 'top' ? 'TopPaste' : 'BottomPaste';
  const filterLayer = side === 'top' ? 'F.Cu' : 'B.Cu';
  const lines = [gerberHeader(layerName), ''];

  // Paste openings only for SMD pads (no through-hole)
  for (const pcbComp of Object.values(state.pcb.components)) {
    if (pcbComp.layer !== filterLayer && pcbComp.layer !== (side === 'top' ? 'TOP' : 'BOTTOM')) continue;
    const fp = FOOTPRINT_MAP[pcbComp.footprintId];
    if (!fp) continue;
    for (const pad of fp.pads) {
      if (pad.padstack?.type === 'TH') continue; // Skip through-hole pads
      const px = pcbComp.x + pad.x / 2.54;
      const py = pcbComp.y + pad.y / 2.54;
      lines.push('D11*');
      lines.push(`X${gx(px)}Y${gy(py)}D03*`);
    }
  }

  lines.push(gerberFooter);
  return lines.join('\n');
}

// ── BOM CSV ───────────────────────────────────────────────────────────────────
export function generateBOM() {
  const rows = ['Designator,Quantity,PartName,Value,FootprintID,Description'];
  const grouped = {};

  for (const comp of Object.values(state.schematic.components)) {
    const key = `${comp.partId}_${comp.value}`;
    if (!grouped[key]) {
      grouped[key] = { ...comp, designators: [] };
    }
    grouped[key].designators.push(comp.id);
  }

  for (const entry of Object.values(grouped)) {
    rows.push([
      entry.designators.join(' '),
      entry.designators.length,
      entry.partName,
      entry.value,
      entry.footprintId ?? '',
      entry.partName,
    ].join(','));
  }

  return rows.join('\n');
}

// ── Pick-and-Place (CPL) CSV ──────────────────────────────────────────────────
export function generatePickAndPlace() {
  const rows = ['Designator,Mid X,Mid Y,Layer,Rotation'];
  for (const pcbComp of Object.values(state.pcb.components)) {
    const x = (pcbComp.x * mmPerUnit).toFixed(3);
    const y = (pcbComp.y * mmPerUnit).toFixed(3);
    rows.push(`${pcbComp.id},${x}mm,${y}mm,${pcbComp.layer},${pcbComp.rotation ?? 0}`);
  }
  return rows.join('\n');
}
