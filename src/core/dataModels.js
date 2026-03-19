/**
 * AltiEDA – Core Data Models
 * All schematic/PCB state is represented as plain JSON-serialisable objects.
 */

// ── Pin types (electrical rules) ──────────────────────────────────────────────
export const PinType = Object.freeze({
  INPUT:       'INPUT',
  OUTPUT:      'OUTPUT',
  BIDIRECTIONAL: 'BIDIRECTIONAL',
  POWER_IN:    'POWER_IN',   // e.g. VCC pin of an IC
  POWER_OUT:   'POWER_OUT',  // e.g. output of voltage regulator
  PASSIVE:     'PASSIVE',    // resistors, caps
  OPEN_COLLECTOR: 'OPEN_COLLECTOR',
  NO_CONNECT:  'NO_CONNECT',
});

// ── Signal / net classifications ──────────────────────────────────────────────
export const NetClass = Object.freeze({
  POWER:    'POWER',
  GND:      'GND',
  I2C:      'I2C',
  SPI:      'SPI',
  UART:     'UART',
  PWM:      'PWM',
  SIGNAL:   'SIGNAL',
  UNROUTED: 'UNROUTED',
});

// ── Factory: create a new Pin ──────────────────────────────────────────────────
export function createPin(number, name, type = PinType.PASSIVE, offsetX = 0, offsetY = 0) {
  return {
    number,       // e.g. 1
    name,         // e.g. "SDA"
    type,         // PinType
    offsetX,      // relative to component origin (schematic grid units)
    offsetY,
    netId: null,  // assigned net UUID
    connected: false,
  };
}

// ── Factory: create a component ───────────────────────────────────────────────
let _compCounter = 0;
export function createComponent(libraryEntry, x = 100, y = 100) {
  const id = `C${++_compCounter}_${libraryEntry.partId}`;
  return {
    id,
    partId:      libraryEntry.partId,
    partName:    libraryEntry.partName,
    category:    libraryEntry.category,
    value:       libraryEntry.defaultValue ?? '',
    x,            // canvas grid units
    y,
    rotation:    0,   // degrees
    mirrored:    false,
    pins:        libraryEntry.pins.map(p => ({ ...p, netId: null, connected: false })),
    footprintId: libraryEntry.footprintId ?? null,
    spiceModel:  libraryEntry.spiceModel ?? null,
    selected:    false,
    layer:       'TOP',
  };
}

// ── Factory: create a Wire segment ───────────────────────────────────────────
let _wireCounter = 0;
export function createWire(x1, y1, x2, y2, netId = null) {
  return {
    id: `W${++_wireCounter}`,
    type: 'wire',
    x1, y1, x2, y2,
    netId,
    junction: false, // if true, explicitly joins crossing wires
  };
}

// ── Factory: create a Net ─────────────────────────────────────────────────────
let _netCounter = 0;
export function createNet(name = null, netClass = NetClass.SIGNAL) {
  const id = `NET${++_netCounter}`;
  return {
    id,
    name: name ?? id,
    netClass,
    pinRefs: [],   // [{ componentId, pinNumber }]
    wireIds: [],
  };
}

// ── Factory: create a Via ─────────────────────────────────────────────────────
let _viaCounter = 0;
export function createVia(x, y, startLayer, endLayer, drillDiameter = 0.3, padDiameter = 0.6) {
  return {
    id: `V${++_viaCounter}`,
    type: 'via',
    x, y,
    startLayer,
    endLayer,
    drillDiameter,  // mm
    padDiameter,    // mm
    netId: null,
  };
}

// ── Factory: create a Virtual Probe ──────────────────────────────────────────
let _probeCounter = 0;
export function createProbe(x, y, probeType = 'voltage') {
  return {
    id: `PROBE${++_probeCounter}`,
    type: 'probe',
    probeType,  // 'voltage' | 'current' | 'differential'
    x, y,
    netId: null,
    netName: null,
    data: [],   // simulation result vectors
  };
}

// ── Global schematic state ────────────────────────────────────────────────────
export function createSchematicState() {
  return {
    components: {},  // id → component
    wires:      {},  // id → wire
    nets:       {},  // id → net
    junctions:  [],  // [{x, y}]
    probes:     {},  // id → probe
  };
}

// ── PCB layout state ──────────────────────────────────────────────────────────
export function createPCBState() {
  return {
    components: {},   // id → placed footprint (x,y,rotation,layer)
    traces:     {},   // id → trace {x1,y1,x2,y2,width,layer,netId}
    vias:       {},   // id → via
    polygons:   [],   // copper pours etc.
    drillHoles: [],   // [{x,y,diameter,throughHole}]
    ratsnest:   [],   // [{fromPin, toPin, netId}]  – unrouted connections
    board:      { width: 100, height: 80, x: 0, y: 0 }, // mm
    activeLayers: ['F.Cu', 'B.Cu', 'F.SilkS', 'B.SilkS', 'Edge.Cuts'],
  };
}

// ── Padstack model ────────────────────────────────────────────────────────────
export function createPadstack(type = 'SMD', shape = 'rect', width = 1.6, height = 0.9) {
  const base = { type, shape, width, height };
  if (type === 'SMD') {
    return {
      ...base,
      soldermaskExpansion: 0.1, // mm
      pasteMaskReduction:  0.0,
      layers: ['F.Cu', 'F.Paste', 'F.Mask'],
    };
  }
  // Through-hole
  return {
    ...base,
    drillDiameter:       0.8,
    annularRing:         0.3,
    soldermaskExpansion: 0.1,
    layers: ['*.Cu', '*.Mask'],
  };
}

// ── Footprint data model ──────────────────────────────────────────────────────
export function createFootprint(id, name, pads = [], courtyard = [], silkscreen = []) {
  return {
    id,
    name,            // e.g. "Resistor_SMD:R_0805_2012Metric"
    pads,            // [{number, x, y, padstack, netId}]
    courtyard,       // [{x,y}] polygon
    silkscreen,      // [{x1,y1,x2,y2}] lines
    3: undefined,    // avoid collision with primitives
    body3d: {        // bounding box for 3D render
      width: 2.0,
      height: 1.2,
      depth: 0.6,
      offsetZ: 0,
    },
  };
}

// ── Layer stackup model ───────────────────────────────────────────────────────
export const defaultStackup = {
  layers: [
    { id: 'F.SilkS',  name: 'Front Silkscreen',  type: 'silkscreen', color: '#ffffff', thickness: 0.01 },
    { id: 'F.Mask',   name: 'Front Solder Mask',  type: 'mask',       color: '#004400aa', thickness: 0.025 },
    { id: 'F.Cu',     name: 'Top Copper',          type: 'copper',     color: '#c87533', thickness: 0.035 },
    { id: 'core1',    name: 'Core (FR4)',           type: 'dielectric', color: '#d4c47a', thickness: 0.36 },
    { id: 'B.Cu',     name: 'Bottom Copper',        type: 'copper',     color: '#c87533', thickness: 0.035 },
    { id: 'B.Mask',   name: 'Back Solder Mask',     type: 'mask',       color: '#004400aa', thickness: 0.025 },
    { id: 'B.SilkS',  name: 'Back Silkscreen',      type: 'silkscreen', color: '#ffffff', thickness: 0.01 },
  ],
  get totalThickness() {
    return this.layers.reduce((s, l) => s + l.thickness, 0);
  },
};

// ── DRC Rule set ──────────────────────────────────────────────────────────────
export const defaultDRCRules = {
  minTrackWidth:     0.2,   // mm
  minClearance:      0.15,  // mm
  minViaDrill:       0.3,   // mm
  minViaPad:         0.6,   // mm
  minAnnularRing:    0.15,  // mm
  minSilkClearance:  0.15,  // mm
  // Electrical
  allowOutputToOutput: false,
  requirePowerNet:     true,
};
