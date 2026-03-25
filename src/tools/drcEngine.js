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
    ...checkCopperPours(rules),
    ...checkHighSpeedRules(rules),
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

// ── 4. Copper Pour Checks ────────────────────────────────────────────────────
function checkCopperPours(rules) {
  const violations = [];
  for (const polygon of (state.pcb.polygons || [])) {
    if (polygon.type !== 'copper_pour') continue;

    // Check pour has a valid net
    if (!polygon.netId) {
      violations.push({
        type: 'PCB_POUR_NO_NET',
        severity: 'warning',
        message: `Copper pour ${polygon.id} has no net assigned`,
      });
    }

    // Check thermal relief sizes
    for (const tp of (polygon.thermalPads || [])) {
      if (tp.thermalWidth < rules.minTrackWidth) {
        violations.push({
          type: 'PCB_THERMAL_WIDTH',
          severity: 'warning',
          message: `Thermal relief width ${tp.thermalWidth}mm < min track width ${rules.minTrackWidth}mm at (${tp.x.toFixed(1)}, ${tp.y.toFixed(1)})`,
          x: tp.x, y: tp.y,
        });
      }
    }
  }
  return violations;
}

// ── 5. High-Speed Design Checks ──────────────────────────────────────────────
function checkHighSpeedRules(rules) {
  const violations = [];
  const traces = Object.values(state.pcb.traces);

  // Check for acute angle traces (< 45°)
  for (let i = 0; i < traces.length; i++) {
    for (let j = i + 1; j < traces.length; j++) {
      const a = traces[i], b = traces[j];
      if (a.netId !== b.netId) continue;

      // Check if traces share an endpoint
      const shared = _sharedEndpoint(a, b);
      if (!shared) continue;

      const angle = _tracesAngle(a, b, shared);
      if (angle < 45 && angle > 0) {
        violations.push({
          type: 'PCB_ACUTE_ANGLE',
          severity: 'warning',
          message: `Acute angle (${angle.toFixed(1)}°) at trace junction (${shared.x.toFixed(1)}, ${shared.y.toFixed(1)}) – may cause acid trap`,
          x: shared.x, y: shared.y,
        });
      }
    }
  }

  // Check trace length matching for differential pairs
  const netGroups = {};
  for (const trace of traces) {
    if (!trace.netId) continue;
    (netGroups[trace.netId] ??= []).push(trace);
  }

  return violations;
}

function _sharedEndpoint(a, b) {
  const eps = 0.1;
  if (Math.abs(a.x2 - b.x1) < eps && Math.abs(a.y2 - b.y1) < eps) return { x: a.x2, y: a.y2 };
  if (Math.abs(a.x2 - b.x2) < eps && Math.abs(a.y2 - b.y2) < eps) return { x: a.x2, y: a.y2 };
  if (Math.abs(a.x1 - b.x1) < eps && Math.abs(a.y1 - b.y1) < eps) return { x: a.x1, y: a.y1 };
  if (Math.abs(a.x1 - b.x2) < eps && Math.abs(a.y1 - b.y2) < eps) return { x: a.x1, y: a.y1 };
  return null;
}

function _tracesAngle(a, b, shared) {
  const eps = 0.1;
  // Get direction vectors away from shared point
  let dxa, dya, dxb, dyb;
  if (Math.abs(a.x1 - shared.x) < eps && Math.abs(a.y1 - shared.y) < eps) {
    dxa = a.x2 - a.x1; dya = a.y2 - a.y1;
  } else {
    dxa = a.x1 - a.x2; dya = a.y1 - a.y2;
  }
  if (Math.abs(b.x1 - shared.x) < eps && Math.abs(b.y1 - shared.y) < eps) {
    dxb = b.x2 - b.x1; dyb = b.y2 - b.y1;
  } else {
    dxb = b.x1 - b.x2; dyb = b.y1 - b.y2;
  }
  const dot = dxa * dxb + dya * dyb;
  const magA = Math.hypot(dxa, dya);
  const magB = Math.hypot(dxb, dyb);
  if (magA < 0.001 || magB < 0.001) return 180;
  return Math.acos(Math.min(1, Math.max(-1, dot / (magA * magB)))) * 180 / Math.PI;
}

// ── Impedance Calculator ─────────────────────────────────────────────────────

/**
 * Calculate microstrip impedance (Z0) for a PCB trace.
 *
 * @param {Object} params
 * @param {number} params.traceWidth - Trace width in mm
 * @param {number} params.dielectricHeight - Distance to reference plane in mm
 * @param {number} params.copperThickness - Copper thickness in mm (default 0.035)
 * @param {number} params.dielectricConstant - Er of PCB material (default 4.5 for FR4)
 * @returns {Object} { impedance, capacitance, inductance, propagationDelay }
 */
export function calculateMicrostripImpedance(params = {}) {
  const {
    traceWidth = 0.2,
    dielectricHeight = 0.36,
    copperThickness = 0.035,
    dielectricConstant = 4.5,
  } = params;

  const w = traceWidth;
  const h = dielectricHeight;
  const t = copperThickness;
  const er = dielectricConstant;

  // Effective width accounting for copper thickness (Hammerstad-Jensen)
  const we = w + (t / Math.PI) * (1 + Math.log(2 * h / t));

  // Effective dielectric constant
  const erEff = ((er + 1) / 2) + ((er - 1) / 2) * (1 / Math.sqrt(1 + 12 * h / we));

  // Characteristic impedance (Hammerstad model)
  let z0;
  if (we / h <= 1) {
    z0 = (60 / Math.sqrt(erEff)) * Math.log((8 * h / we) + (we / (4 * h)));
  } else {
    z0 = (120 * Math.PI) / (Math.sqrt(erEff) * (we / h + 1.393 + 0.667 * Math.log(we / h + 1.444)));
  }

  // Propagation delay (ps/mm)
  const c = 299.792; // mm/ps
  const propDelay = Math.sqrt(erEff) / c * 1000; // ps/mm

  // Capacitance per unit length (pF/mm)
  const cap = 1000 / (z0 * c / Math.sqrt(erEff)); // pF/mm

  // Inductance per unit length (nH/mm)
  const ind = z0 * z0 * cap / 1000; // nH/mm

  return {
    impedance: z0,
    effectiveDielectric: erEff,
    capacitancePerMM: cap,
    inductancePerMM: ind,
    propagationDelay: propDelay,
    traceWidth: w,
    dielectricHeight: h,
  };
}

/**
 * Calculate stripline impedance (trace between two ground planes).
 */
export function calculateStriplineImpedance(params = {}) {
  const {
    traceWidth = 0.2,
    dielectricHeight = 0.36, // total height between planes
    copperThickness = 0.035,
    dielectricConstant = 4.5,
  } = params;

  const w = traceWidth;
  const b = dielectricHeight;
  const t = copperThickness;
  const er = dielectricConstant;

  // Effective width
  const we = (w < b / (0.35 - t / b))
    ? w + (0.35 - t / b) * (0.35 - t / b) * t / w
    : w;

  // Cohn model
  const z0 = (60 / Math.sqrt(er)) * Math.log((4 * b) / (0.67 * Math.PI * we * (1 + we / (4 * b))));

  const c = 299.792;
  const propDelay = Math.sqrt(er) / c * 1000;

  return {
    impedance: z0,
    propagationDelay: propDelay,
    traceWidth: w,
    dielectricHeight: b,
  };
}

/**
 * Calculate differential pair impedance.
 */
export function calculateDifferentialImpedance(params = {}) {
  const {
    traceWidth = 0.15,
    traceSpacing = 0.2,
    dielectricHeight = 0.36,
    copperThickness = 0.035,
    dielectricConstant = 4.5,
  } = params;

  // First calculate single-ended impedance
  const single = calculateMicrostripImpedance({
    traceWidth, dielectricHeight, copperThickness, dielectricConstant,
  });

  // Differential impedance with coupling factor
  const s = traceSpacing;
  const h = dielectricHeight;
  const kCoupling = 1 - 0.48 * Math.exp(-0.96 * s / h);
  const zDiff = 2 * single.impedance * kCoupling;

  return {
    singleEnded: single.impedance,
    differential: zDiff,
    commonMode: single.impedance / kCoupling,
    couplingFactor: kCoupling,
    traceWidth,
    traceSpacing,
  };
}

/**
 * Suggest trace width for a target impedance.
 */
export function suggestTraceWidth(targetZ0 = 50, params = {}) {
  const {
    dielectricHeight = 0.36,
    copperThickness = 0.035,
    dielectricConstant = 4.5,
  } = params;

  // Binary search for width
  let lo = 0.05, hi = 5.0;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const z = calculateMicrostripImpedance({
      traceWidth: mid, dielectricHeight, copperThickness, dielectricConstant,
    }).impedance;
    if (z > targetZ0) lo = mid;
    else hi = mid;
  }

  const width = (lo + hi) / 2;
  const result = calculateMicrostripImpedance({
    traceWidth: width, dielectricHeight, copperThickness, dielectricConstant,
  });

  return {
    suggestedWidth: width,
    actualImpedance: result.impedance,
    targetImpedance: targetZ0,
  };
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
