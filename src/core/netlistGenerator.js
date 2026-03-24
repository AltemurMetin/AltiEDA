/**
 * AltiEDA – Netlist Generator & PCB Mode Switcher
 *
 * generateNetlist()  → structured JSON netlist
 * buildRatsnest()    → unrouted connection stubs for PCB view
 * switchToPCBMode()  → rerender canvas with footprints + ratsnest
 */
import { state } from './schematicState.js';
import { FOOTPRINT_MAP } from './footprintLibrary.js';

// ── JSON Netlist ──────────────────────────────────────────────────────────────
export function generateNetlist() {
  const nets  = {};
  const comps = {};

  for (const comp of Object.values(state.schematic.components)) {
    comps[comp.id] = {
      id:          comp.id,
      partId:      comp.partId,
      partName:    comp.partName,
      value:       comp.value,
      footprintId: comp.footprintId,
      pins:        comp.pins.map(p => ({
        number:  p.number,
        name:    p.name,
        type:    p.type,
        netId:   p.netId ?? null,
      })),
    };
  }

  for (const net of Object.values(state.schematic.nets)) {
    nets[net.id] = {
      id:       net.id,
      name:     net.name,
      netClass: net.netClass,
      pinRefs:  net.pinRefs,          // [{componentId, pinNumber}]
      wireIds:  net.wireIds,
    };
  }

  return {
    timestamp:  new Date().toISOString(),
    components: comps,
    nets,
    wires:      Object.values(state.schematic.wires),
    junctions:  state.schematic.junctions,
  };
}

// ── Build ratsnest from netlist ───────────────────────────────────────────────
export function buildRatsnest(netlist) {
  const ratsnest = [];

  for (const net of Object.values(netlist.nets)) {
    const pins = net.pinRefs;
    for (let i = 0; i < pins.length - 1; i++) {
      const compA = netlist.components[pins[i].componentId];
      const compB = netlist.components[pins[i + 1].componentId];
      if (!compA || !compB) continue;

      const pinA = compA.pins.find(p => p.number === pins[i].pinNumber);
      const pinB = compB.pins.find(p => p.number === pins[i + 1].pinNumber);

      // Get footprint pad positions
      const fpA = FOOTPRINT_MAP[compA.footprintId];
      const fpB = FOOTPRINT_MAP[compB.footprintId];

      const padA = fpA?.pads.find(pd => pd.number === pinA?.number);
      const padB = fpB?.pads.find(pd => pd.number === pinB?.number);

      const pcbA = state.pcb.components[compA.id];
      const pcbB = state.pcb.components[compB.id];

      if (!pcbA || !pcbB) continue;

      ratsnest.push({
        netId: net.id,
        netName: net.name,
        x1: pcbA.x + (padA?.x ?? 0),
        y1: pcbA.y + (padA?.y ?? 0),
        x2: pcbB.x + (padB?.x ?? 0),
        y2: pcbB.y + (padB?.y ?? 0),
      });
    }
  }

  return ratsnest;
}

// ── Switch to PCB mode ────────────────────────────────────────────────────────
export function switchToPCBMode(renderer) {
  state.mode = 'pcb';

  // Place components in PCB state if not already there
  for (const comp of Object.values(state.schematic.components)) {
    if (!state.pcb.components[comp.id]) {
      state.pcb.components[comp.id] = {
        id:          comp.id,
        footprintId: comp.footprintId,
        x:           comp.x,   // copy schematic position (user will arrange)
        y:           comp.y,
        rotation:    comp.rotation,
        layer:       'F.Cu',
      };
    }
  }

  // Convert schematic wires to PCB copper traces (if not already created)
  if (Object.keys(state.pcb.traces).length === 0) {
    for (const wire of Object.values(state.schematic.wires)) {
      const traceId = 'trace_' + wire.id;
      state.pcb.traces[traceId] = {
        id:    traceId,
        x1:    wire.x1,
        y1:    wire.y1,
        x2:    wire.x2,
        y2:    wire.y2,
        layer: wire.layer || 'F.Cu',
        width: 0.25,         // default trace width (mm equivalent in grid)
        netId: wire.netId ?? null,
      };
    }
  }

  // Auto-size board to fit all placed components with margin
  const comps = Object.values(state.pcb.components);
  if (comps.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of comps) {
      const fp = FOOTPRINT_MAP[c.footprintId];
      const margin = fp ? Math.max(...fp.courtyard.map(p => Math.max(Math.abs(p[0]), Math.abs(p[1])))) + 5 : 10;
      minX = Math.min(minX, c.x - margin);
      minY = Math.min(minY, c.y - margin);
      maxX = Math.max(maxX, c.x + margin);
      maxY = Math.max(maxY, c.y + margin);
    }
    // Also include trace endpoints
    for (const t of Object.values(state.pcb.traces)) {
      minX = Math.min(minX, t.x1, t.x2);
      minY = Math.min(minY, t.y1, t.y2);
      maxX = Math.max(maxX, t.x1, t.x2);
      maxY = Math.max(maxY, t.y1, t.y2);
    }
    const pad = 5; // 5-unit padding
    state.pcb.board = {
      x: minX - pad,
      y: minY - pad,
      width:  (maxX - minX) + pad * 2,
      height: (maxY - minY) + pad * 2,
    };
  }

  const netlist = generateNetlist();
  state.pcb.ratsnest = buildRatsnest(netlist);

  // Apply PCB theme and center view on the board
  if (renderer.applyTheme) renderer.applyTheme('pcb');
  if (renderer.fitAll) renderer.fitAll();
  else renderer.render();
}

// ── Switch to Schematic mode ──────────────────────────────────────────────────
export function switchToSchematicMode(renderer) {
  state.mode = 'schematic';
  if (renderer.applyTheme) renderer.applyTheme('schematic');
  if (renderer.fitAll) renderer.fitAll();
  // Synchronous draw to immediately clear stale PCB board from canvas
  if (renderer.renderImmediate) renderer.renderImmediate();
}
