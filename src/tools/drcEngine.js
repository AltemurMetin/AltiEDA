/**
 * AltiEDA – Design Rule Check (DRC) Engine
 *
 * runDRC()  →  { errors, warnings }
 * Each violation: { type, severity, message, x?, y?, componentId? }
 */
import { state }          from '../core/schematicState.js';
import { defaultDRCRules, PinType } from '../core/dataModels.js';
import { FOOTPRINT_MAP }  from '../core/footprintLibrary.js';

// ── Entry point ───────────────────────────────────────────────────────────────
export function runDRC(rules = defaultDRCRules) {
  const violations = [
    ...checkElectricalRules(rules),
    ...checkPhysicalRules(rules),
    ...checkUnconnectedPins(),
  ];

  const errors   = violations.filter(v => v.severity === 'error');
  const warnings = violations.filter(v => v.severity === 'warning');

  return { errors, warnings, all: violations };
}

// ── 1. Electrical Rules ───────────────────────────────────────────────────────
function checkElectricalRules(rules) {
  const violations = [];

  for (const net of Object.values(state.schematic.nets)) {
    const pinDetails = net.pinRefs.map(ref => {
      const comp = state.schematic.components[ref.componentId];
      const pin  = comp?.pins.find(p => p.number === ref.pinNumber);
      return { ...ref, pinType: pin?.type, pinName: pin?.name, compName: comp?.partName, x: comp?.x, y: comp?.y };
    });

    // Check every pair of pins on the same net
    for (let i = 0; i < pinDetails.length; i++) {
      for (let j = i + 1; j < pinDetails.length; j++) {
        const a = pinDetails[i];
        const b = pinDetails[j];
        if (!a.pinType || !b.pinType) continue;

        // Output → Output
        if (a.pinType === PinType.OUTPUT && b.pinType === PinType.OUTPUT) {
          violations.push({
            type:        'ERC_OUTPUT_CONFLICT',
            severity:    'error',
            message:     `Net "${net.name}": Output pin ${a.pinName} (${a.compName}) drives Output pin ${b.pinName} (${b.compName}) – bus contention.`,
            netId:       net.id,
            x:           a.x,
            y:           a.y,
          });
        }

        // Power Output → Power Output
        if (a.pinType === PinType.POWER_OUT && b.pinType === PinType.POWER_OUT) {
          violations.push({
            type:        'ERC_POWER_CONFLICT',
            severity:    'error',
            message:     `Net "${net.name}": Power Output ${a.pinName} (${a.compName}) shorted to ${b.pinName} (${b.compName}) – risk of short circuit.`,
            netId:       net.id,
            x:           a.x,
            y:           a.y,
          });
        }

        // Output → Power Output
        if ((a.pinType === PinType.OUTPUT && b.pinType === PinType.POWER_OUT) ||
            (a.pinType === PinType.POWER_OUT && b.pinType === PinType.OUTPUT)) {
          violations.push({
            type:        'ERC_OUTPUT_POWER_CONFLICT',
            severity:    'error',
            message:     `Net "${net.name}": Signal Output connected to Power Output – potential latch-up.`,
            netId:       net.id,
            x:           a.x,
            y:           a.y,
          });
        }
      }
    }
  }

  return violations;
}

// ── 2. Physical PCB Rules ─────────────────────────────────────────────────────
function checkPhysicalRules(rules) {
  const violations = [];
  const traces     = Object.values(state.pcb.traces);
  const vias       = Object.values(state.pcb.vias);

  // 2a. Minimum track width
  for (const trace of traces) {
    if (trace.width < rules.minTrackWidth) {
      violations.push({
        type:     'PCB_TRACK_WIDTH',
        severity: 'error',
        message:  `Trace on ${trace.layer}: width ${trace.width.toFixed(2)}mm < min ${rules.minTrackWidth}mm`,
        x:        (trace.x1 + trace.x2) / 2,
        y:        (trace.y1 + trace.y2) / 2,
      });
    }
  }

  // 2b. Trace-to-trace clearance (same layer, different nets)
  for (let i = 0; i < traces.length; i++) {
    for (let j = i + 1; j < traces.length; j++) {
      const a = traces[i], b = traces[j];
      if (a.layer !== b.layer) continue;
      if (a.netId === b.netId) continue;
      const dist = _segToSegDist(a, b);
      if (dist < rules.minClearance) {
        violations.push({
          type:     'PCB_CLEARANCE',
          severity: 'error',
          message:  `Clearance violation: traces on ${a.layer} are ${dist.toFixed(3)}mm apart (min ${rules.minClearance}mm)`,
          x:        (a.x1 + b.x1) / 2,
          y:        (a.y1 + b.y1) / 2,
        });
      }
    }
  }

  // 2c. Via drill size
  for (const via of vias) {
    if (via.drillDiameter < rules.minViaDrill) {
      violations.push({
        type:     'PCB_VIA_DRILL',
        severity: 'error',
        message:  `Via at (${via.x},${via.y}): drill ${via.drillDiameter}mm < min ${rules.minViaDrill}mm`,
        x:        via.x,
        y:        via.y,
      });
    }
    const ring = (via.padDiameter - via.drillDiameter) / 2;
    if (ring < rules.minAnnularRing) {
      violations.push({
        type:     'PCB_ANNULAR_RING',
        severity: 'warning',
        message:  `Via at (${via.x},${via.y}): annular ring ${ring.toFixed(3)}mm < min ${rules.minAnnularRing}mm`,
        x:        via.x,
        y:        via.y,
      });
    }
  }

  // 2d. Pad-to-pad clearance (different nets, same layer)
  const pads = _getAllPads();
  for (let i = 0; i < pads.length; i++) {
    for (let j = i + 1; j < pads.length; j++) {
      const pa = pads[i], pb = pads[j];
      if (pa.netId === pb.netId) continue;
      if (pa.layer !== pb.layer) continue;
      const dist = Math.hypot(pa.wx - pb.wx, pa.wy - pb.wy)
                   - (pa.w + pb.w) / 4;  // crude edge estimate
      if (dist < rules.minClearance) {
        violations.push({
          type:     'PCB_PAD_CLEARANCE',
          severity: 'error',
          message:  `Pad clearance violation: ${dist.toFixed(3)}mm < min ${rules.minClearance}mm`,
          x:        (pa.wx + pb.wx) / 2,
          y:        (pa.wy + pb.wy) / 2,
        });
      }
    }
  }

  return violations;
}

// ── 3. Unconnected pins ───────────────────────────────────────────────────────
function checkUnconnectedPins() {
  const violations = [];
  for (const comp of Object.values(state.schematic.components)) {
    for (const pin of comp.pins) {
      if (pin.type === 'NO_CONNECT') continue;
      if (!pin.netId && !pin.connected) {
        violations.push({
          type:        'ERC_UNCONNECTED_PIN',
          severity:    'warning',
          message:     `Unconnected pin ${pin.name} on ${comp.partName} (${comp.id})`,
          componentId: comp.id,
          x:           comp.x,
          y:           comp.y,
        });
      }
    }
  }
  return violations;
}

// ── Segment-to-segment minimum distance (2D) ──────────────────────────────────
function _segToSegDist(a, b) {
  // Simplified: check endpoints against segment + midpoint-to-midpoint
  const pts = [
    _ptToSeg(a.x1, a.y1, b.x1, b.y1, b.x2, b.y2),
    _ptToSeg(a.x2, a.y2, b.x1, b.y1, b.x2, b.y2),
    _ptToSeg(b.x1, b.y1, a.x1, a.y1, a.x2, a.y2),
    _ptToSeg(b.x2, b.y2, a.x1, a.y1, a.x2, a.y2),
  ];
  return Math.min(...pts);
}

function _ptToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function _getAllPads() {
  const pads = [];
  const mmpu = 0.1;  // mm per world unit
  for (const pcbComp of Object.values(state.pcb.components)) {
    const fp = FOOTPRINT_MAP[pcbComp.footprintId];
    if (!fp) continue;
    for (const pad of fp.pads) {
      pads.push({
        netId: pad.netId,
        layer: pcbComp.layer,
        wx:    pcbComp.x + pad.x / mmpu,
        wy:    pcbComp.y + pad.y / mmpu,
        w:     pad.padstack.width / mmpu,
        h:     pad.padstack.height / mmpu,
      });
    }
  }
  return pads;
}

// ── DRC UI: render violations in the DRC panel ────────────────────────────────
export function renderDRCPanel(result) {
  const list = document.getElementById('drc-list');
  const panel = document.getElementById('drc-panel');
  if (!list || !panel) return;

  panel.classList.remove('hidden');

  const items = result.all.map(v => {
    const li = document.createElement('li');
    li.className = v.severity;
    li.innerHTML = `<span>${v.severity === 'error' ? '✖' : '⚠'}</span><span>${v.message}</span>`;
    return li;
  });

  list.innerHTML = '';
  if (items.length === 0) {
    list.innerHTML = '<li style="color:#4caf50;padding:4px 8px">✔ No DRC violations found.</li>';
  } else {
    items.forEach(li => list.appendChild(li));
  }

  return result;
}
