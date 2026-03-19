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

  const netlist = generateNetlist();
  state.pcb.ratsnest = buildRatsnest(netlist);
  renderer.render();
}

// ── Switch to Schematic mode ──────────────────────────────────────────────────
export function switchToSchematicMode(renderer) {
  state.mode = 'schematic';
  renderer.render();
}
