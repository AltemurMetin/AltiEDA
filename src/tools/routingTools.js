/**
 * AltiEDA – Routing & Connection Tools
 *
 * Wire Tool  – logical connectivity, net assignment, junction rules
 * Pin Tool   – electrical rule check at placement time
 * Via Tool   – multi-layer logical via
 * Probe Tool – virtual measurement probe
 */
import { state } from '../core/schematicState.js';
import {
  PinType, NetClass,
  createWire, createVia, createProbe, createNet,
} from '../core/dataModels.js';

// ── ERC conflict table ────────────────────────────────────────────────────────
// Returns true if connecting pinTypeA → pinTypeB is an ERC violation
export function isERCViolation(typeA, typeB) {
  const conflicts = [
    [PinType.OUTPUT,    PinType.OUTPUT],
    [PinType.POWER_OUT, PinType.POWER_OUT],
    [PinType.OUTPUT,    PinType.POWER_OUT],
  ];
  return conflicts.some(
    ([a, b]) => (typeA === a && typeB === b) || (typeA === b && typeB === a)
  );
}

export function ercDescription(typeA, typeB) {
  if (typeA === PinType.OUTPUT && typeB === PinType.OUTPUT)
    return 'Output-to-Output conflict: bus contention possible.';
  if (typeA === PinType.POWER_OUT && typeB === PinType.POWER_OUT)
    return 'Power-Output-to-Power-Output: risk of short circuit.';
  return 'ERC violation: incompatible pin types.';
}

// ── Wire Tool ─────────────────────────────────────────────────────────────────
const WIRE_SNAP_PX = 28;   // screen-pixel snap radius for pin/wire endpoint detection
const GRID_PX      = 20;   // must match canvasRenderer GRID constant

export class WireTool {
  constructor(renderer) {
    this.renderer     = renderer;
    this.active       = false;
    this.startX       = null;
    this.startY       = null;
    this.currentNetId = null;
    this._previewWire = null;
  }

  /** Snap to nearest pin OR wire-endpoint within WIRE_SNAP_PX screen pixels.
   *  Returns {x, y, found: bool}. found=false means free-space click. */
  _snap(wx, wy) {
    const worldR = WIRE_SNAP_PX / (GRID_PX * this.renderer.zoom);
    let best = null, bestDist = worldR;
    // 1. Pins (offsetX/Y are canvas-px units → divide by GRID_PX for world coords)
    for (const comp of Object.values(state.schematic.components)) {
      for (const pin of comp.pins) {
        const px = comp.x + pin.offsetX / GRID_PX;
        const py = comp.y + pin.offsetY / GRID_PX;
        const d  = Math.hypot(px - wx, py - wy);
        if (d < bestDist) { bestDist = d; best = { x: px, y: py }; }
      }
    }
    // 2. Existing wire endpoints
    for (const wire of Object.values(state.schematic.wires)) {
      for (const pt of [{x: wire.x1, y: wire.y1}, {x: wire.x2, y: wire.y2}]) {
        const d = Math.hypot(pt.x - wx, pt.y - wy);
        if (d < bestDist) { bestDist = d; best = pt; }
      }
    }
    if (best) return { x: best.x, y: best.y, found: true };
    return { ...this.renderer.snapToGrid(wx, wy), found: false };
  }

  /** Preview snap without the "must be found" constraint — for visual feedback */
  _snapPreview(wx, wy) { return this._snap(wx, wy); }

  /** Returns {x1,y1, mx,my, x2,y2, snapOk} for the L-shape preview */
  preview(worldX, worldY) {
    if (!this.active) return null;
    const s = this._snapPreview(worldX, worldY);
    const mx = s.x, my = this.startY;   // H-first bend
    this._previewWire = { x1: this.startX, y1: this.startY, mx, my, x2: s.x, y2: s.y, snapOk: s.found };
    return this._previewWire;
  }

  /** Called when the user clicks to start drawing */
  begin(worldX, worldY) {
    const s = this._snap(worldX, worldY);
    if (!s.found) return { error: 'Click on a pin or wire endpoint to start' };
    this.startX  = s.x;
    this.startY  = s.y;
    this.active  = true;
    this.currentNetId = this._netAtPoint(s.x, s.y);
    if (!this.currentNetId) {
      const net = createNet(null, NetClass.SIGNAL);
      state.schematic.nets[net.id] = net;
      this.currentNetId = net.id;
    }
    return null;
  }

  /** Called on click – commits orthogonal L-shaped pair of segments */
  commit(worldX, worldY) {
    if (!this.active) return null;
    const s = this._snap(worldX, worldY);
    if (!s.found) return { error: 'Click on a pin or wire endpoint to end' };

    if (s.x === this.startX && s.y === this.startY) return null;

    // ERC check at endpoint
    const endNetId = this._netAtPoint(s.x, s.y);
    if (endNetId && endNetId !== this.currentNetId) {
      const violation = this._checkMergeConflict(this.currentNetId, endNetId);
      if (violation) { console.warn('[ERC]', violation); return { error: violation }; }
      this._mergeNets(this.currentNetId, endNetId);
    }

    // L-shape: two orthogonal segments (H-first: startX→endX, then endX→endY)
    const mx = s.x, my = this.startY;   // bend point
    const segments = [];
    if (mx !== this.startX || my !== this.startY) {
      segments.push(createWire(this.startX, this.startY, mx, my, this.currentNetId));
    }
    if (s.x !== mx || s.y !== my) {
      segments.push(createWire(mx, my, s.x, s.y, this.currentNetId));
    }
    if (segments.length === 0) return null;

    for (const wire of segments) {
      if (this._isJunctionPoint(wire.x2, wire.y2)) {
        state.schematic.junctions.push({ x: wire.x2, y: wire.y2 });
      }
      state.addWire(wire);
      const net = state.schematic.nets[wire.netId];
      if (net) { net.wireIds = net.wireIds ?? []; net.wireIds.push(wire.id); }
    }

    // Assign netId to pins at endpoints
    this._connectPinsAtPoint(this.startX, this.startY, this.currentNetId);
    this._connectPinsAtPoint(s.x, s.y, this.currentNetId);

    // Wire ends → start again from endpoint (chain mode)
    this.startX = s.x;
    this.startY = s.y;

    return segments;
  }

  end() { this.active = false; this._previewWire = null; }

  // ── Helpers ──────────────────────────────────────────────────────────────
  _connectPinsAtPoint(x, y, netId) {
    for (const comp of Object.values(state.schematic.components)) {
      for (const pin of comp.pins) {
        const px = comp.x + pin.offsetX / GRID_PX;
        const py = comp.y + pin.offsetY / GRID_PX;
        if (Math.abs(px - x) < 0.1 && Math.abs(py - y) < 0.1) {
          pin.netId = netId;
          // Record pinRef on net
          const net = state.schematic.nets[netId];
          if (net) {
            net.pinRefs = net.pinRefs ?? [];
            const already = net.pinRefs.some(r => r.componentId === comp.id && r.pinNumber === pin.number);
            if (!already) net.pinRefs.push({ componentId: comp.id, pinNumber: pin.number });
          }
        }
      }
    }
  }

  _netAtPoint(x, y) {
    for (const comp of Object.values(state.schematic.components)) {
      for (const pin of comp.pins) {
        if (Math.abs(comp.x + pin.offsetX / GRID_PX - x) < 0.1 &&
            Math.abs(comp.y + pin.offsetY / GRID_PX - y) < 0.1) {
          return pin.netId;
        }
      }
    }
    // Check wire endpoints
    for (const wire of Object.values(state.schematic.wires)) {
      if ((Math.abs(wire.x1 - x) < 0.1 && Math.abs(wire.y1 - y) < 0.1) ||
          (Math.abs(wire.x2 - x) < 0.1 && Math.abs(wire.y2 - y) < 0.1)) {
        return wire.netId;
      }
    }
    return null;
  }

  _isJunctionPoint(x, y) {
    // A junction exists when an endpoint lands on the interior of another wire
    for (const wire of Object.values(state.schematic.wires)) {
      if (_pointOnSegment(x, y, wire.x1, wire.y1, wire.x2, wire.y2)) return true;
    }
    return false;
  }

  _checkMergeConflict(netIdA, netIdB) {
    const pinsA = state.schematic.nets[netIdA]?.pinRefs ?? [];
    const pinsB = state.schematic.nets[netIdB]?.pinRefs ?? [];
    for (const ra of pinsA) {
      for (const rb of pinsB) {
        const pinA = state.schematic.components[ra.componentId]?.pins.find(p => p.number === ra.pinNumber);
        const pinB = state.schematic.components[rb.componentId]?.pins.find(p => p.number === rb.pinNumber);
        if (pinA && pinB && isERCViolation(pinA.type, pinB.type)) {
          return ercDescription(pinA.type, pinB.type);
        }
      }
    }
    return null;
  }

  _mergeNets(keepId, removeId) {
    const keep   = state.schematic.nets[keepId];
    const remove = state.schematic.nets[removeId];
    if (!keep || !remove) return;
    remove.pinRefs.forEach(r => {
      keep.pinRefs.push(r);
      const comp = state.schematic.components[r.componentId];
      const pin  = comp?.pins.find(p => p.number === r.pinNumber);
      if (pin) pin.netId = keepId;
    });
    remove.wireIds.forEach(wId => {
      const w = state.schematic.wires[wId];
      if (w) w.netId = keepId;
      keep.wireIds.push(wId);
    });
    delete state.schematic.nets[removeId];
  }
}

// ── Via Tool ──────────────────────────────────────────────────────────────────
export function placeVia(worldX, worldY, startLayer, endLayer, renderer) {
  const snapped = renderer.snapToGrid(worldX, worldY);
  const via     = createVia(snapped.x, snapped.y, startLayer, endLayer);

  // Find which net this point belongs to (from trace endpoints)
  for (const trace of Object.values(state.pcb.traces)) {
    if ((Math.abs(trace.x2 - snapped.x) < 1 && Math.abs(trace.y2 - snapped.y) < 1) ||
        (Math.abs(trace.x1 - snapped.x) < 1 && Math.abs(trace.y1 - snapped.y) < 1)) {
      via.netId = trace.netId;
      break;
    }
  }

  state.addVia(via);

  // Update netlist: record via as a pseudo-connection between layers
  if (via.netId) {
    const net = state.schematic.nets[via.netId];
    if (net) {
      net.viaRefs = net.viaRefs ?? [];
      net.viaRefs.push({ viaId: via.id, startLayer, endLayer });
    }
  }

  return via;
}

// ── Probe Tool ────────────────────────────────────────────────────────────────
export function placeProbeTool(worldX, worldY, probeType, renderer) {
  const snapped  = renderer.snapToGrid(worldX, worldY);
  const probe    = createProbe(snapped.x, snapped.y, probeType);

  // Find net at location
  const netId = _findNetAtPoint(snapped.x, snapped.y);
  if (netId) {
    probe.netId   = netId;
    probe.netName = state.schematic.nets[netId]?.name ?? netId;
  }

  state.addProbe(probe);
  return probe;
}

export function getProbeNetName(probe) {
  if (probe.netId) return state.schematic.nets[probe.netId]?.name ?? probe.netId;
  return '(unconnected)';
}

// ── Geometry helpers ──────────────────────────────────────────────────────────
function _pointOnSegment(px, py, x1, y1, x2, y2, tol = 0.5) {
  const d = _segDist(px, py, x1, y1, x2, y2);
  return d < tol;
}

function _segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function _findNetAtPoint(x, y) {
  for (const wire of Object.values(state.schematic.wires)) {
    if (_pointOnSegment(x, y, wire.x1, wire.y1, wire.x2, wire.y2)) return wire.netId;
  }
  for (const comp of Object.values(state.schematic.components)) {
    for (const pin of comp.pins) {
      if (Math.abs(comp.x + pin.offsetX / GRID_PX - x) < 0.1 &&
          Math.abs(comp.y + pin.offsetY / GRID_PX - y) < 0.1) {
        return pin.netId;
      }
    }
  }
  return null;
}
