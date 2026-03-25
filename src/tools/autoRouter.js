/**
 * AltiEDA – PCB Autorouter & Copper Pour
 *
 * autoRoute()   – A* grid-based autorouter for PCB traces
 * copperPour()  – polygon-fill copper zone with thermal relief
 */
import { state } from '../core/schematicState.js';
import { FOOTPRINT_MAP } from '../core/footprintLibrary.js';
import { generateNetlist, buildRatsnest } from '../core/netlistGenerator.js';

// ── Grid-based A* Autorouter ────────────────────────────────────────────────

const GRID_STEP = 0.5;  // routing grid resolution (mm-equivalent world units)

/** Priority queue (min-heap) for A* */
class MinHeap {
  constructor() { this._data = []; }
  push(item) {
    this._data.push(item);
    this._bubbleUp(this._data.length - 1);
  }
  pop() {
    const top = this._data[0];
    const last = this._data.pop();
    if (this._data.length > 0) { this._data[0] = last; this._sinkDown(0); }
    return top;
  }
  get size() { return this._data.length; }
  _bubbleUp(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._data[p].f <= this._data[i].f) break;
      [this._data[p], this._data[i]] = [this._data[i], this._data[p]];
      i = p;
    }
  }
  _sinkDown(i) {
    const n = this._data.length;
    while (true) {
      let smallest = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this._data[l].f < this._data[smallest].f) smallest = l;
      if (r < n && this._data[r].f < this._data[smallest].f) smallest = r;
      if (smallest === i) break;
      [this._data[smallest], this._data[i]] = [this._data[i], this._data[smallest]];
      i = smallest;
    }
  }
}

/** Convert world coordinate to grid index */
function toGrid(v) { return Math.round(v / GRID_STEP); }
function fromGrid(g) { return g * GRID_STEP; }
function gridKey(gx, gy) { return `${gx},${gy}`; }

/**
 * Build an obstacle map from existing traces and component pads (different net).
 * Returns a Set of gridKey strings that are blocked.
 */
function buildObstacleMap(excludeNetId, clearance = 0.3) {
  const blocked = new Set();
  const clearGrid = Math.ceil(clearance / GRID_STEP);

  // Block existing traces from other nets
  for (const trace of Object.values(state.pcb.traces)) {
    if (trace.netId === excludeNetId) continue;
    const steps = Math.ceil(Math.hypot(trace.x2 - trace.x1, trace.y2 - trace.y1) / GRID_STEP) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const gx = toGrid(trace.x1 + (trace.x2 - trace.x1) * t);
      const gy = toGrid(trace.y1 + (trace.y2 - trace.y1) * t);
      for (let dx = -clearGrid; dx <= clearGrid; dx++) {
        for (let dy = -clearGrid; dy <= clearGrid; dy++) {
          blocked.add(gridKey(gx + dx, gy + dy));
        }
      }
    }
  }

  // Block pads from other nets
  for (const pcbComp of Object.values(state.pcb.components)) {
    const fp = FOOTPRINT_MAP[pcbComp.footprintId];
    if (!fp) continue;
    for (const pad of fp.pads) {
      if (pad.netId === excludeNetId) continue;
      const gx = toGrid(pcbComp.x + pad.x);
      const gy = toGrid(pcbComp.y + pad.y);
      for (let dx = -clearGrid; dx <= clearGrid; dx++) {
        for (let dy = -clearGrid; dy <= clearGrid; dy++) {
          blocked.add(gridKey(gx + dx, gy + dy));
        }
      }
    }
  }

  return blocked;
}

/**
 * A* pathfinding between two points on the routing grid.
 * Returns array of {x, y} waypoints or null if no path found.
 */
function aStarRoute(sx, sy, ex, ey, obstacles, maxIterations = 50000) {
  const sgx = toGrid(sx), sgy = toGrid(sy);
  const egx = toGrid(ex), egy = toGrid(ey);

  if (sgx === egx && sgy === egy) return [{ x: sx, y: sy }];

  const open = new MinHeap();
  const closed = new Set();
  const cameFrom = new Map();
  const gScore = new Map();

  const startKey = gridKey(sgx, sgy);
  gScore.set(startKey, 0);
  open.push({ gx: sgx, gy: sgy, f: Math.abs(egx - sgx) + Math.abs(egy - sgy), key: startKey });

  // 8-directional movement (orthogonal + 45°)
  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414],
  ];

  let iterations = 0;
  while (open.size > 0 && iterations++ < maxIterations) {
    const current = open.pop();
    if (current.gx === egx && current.gy === egy) {
      // Reconstruct path
      const path = [];
      let key = current.key;
      while (key) {
        const [gxs, gys] = key.split(',').map(Number);
        path.unshift({ x: fromGrid(gxs), y: fromGrid(gys) });
        key = cameFrom.get(key);
      }
      return simplifyPath(path);
    }

    if (closed.has(current.key)) continue;
    closed.add(current.key);

    for (const [dx, dy, cost] of dirs) {
      const nx = current.gx + dx, ny = current.gy + dy;
      const nKey = gridKey(nx, ny);
      if (closed.has(nKey) || obstacles.has(nKey)) continue;

      const tentG = (gScore.get(current.key) ?? Infinity) + cost;
      if (tentG < (gScore.get(nKey) ?? Infinity)) {
        gScore.set(nKey, tentG);
        cameFrom.set(nKey, current.key);
        const h = Math.abs(egx - nx) + Math.abs(egy - ny);
        // Prefer L-shaped routes: penalize diagonal moves slightly
        const penalty = (dx !== 0 && dy !== 0) ? 0.1 : 0;
        open.push({ gx: nx, gy: ny, f: tentG + h + penalty, key: nKey });
      }
    }
  }

  return null; // No path found
}

/**
 * Simplify path by removing collinear points (Douglas-Peucker-like).
 */
function simplifyPath(path) {
  if (path.length <= 2) return path;
  const result = [path[0]];
  let prevDir = null;

  for (let i = 1; i < path.length; i++) {
    const dx = Math.sign(path[i].x - path[i - 1].x);
    const dy = Math.sign(path[i].y - path[i - 1].y);
    const dir = `${dx},${dy}`;
    if (dir !== prevDir) {
      if (i > 1) result.push(path[i - 1]);
      prevDir = dir;
    }
  }
  result.push(path[path.length - 1]);
  return result;
}

/**
 * Run the autorouter on all unrouted ratsnest connections.
 * Returns { routed: number, failed: number, traces: [] }
 */
export function autoRoute(options = {}) {
  const {
    traceWidth = 0.25,
    clearance = 0.3,
    layer = 'F.Cu',
    routeAll = true,
  } = options;

  const netlist = generateNetlist();
  const ratsnest = buildRatsnest(netlist);

  // Group ratsnest by net for ordered routing
  const netGroups = {};
  for (const rat of ratsnest) {
    (netGroups[rat.netId] ??= []).push(rat);
  }

  let routed = 0, failed = 0;
  const newTraces = [];
  let traceCounter = Object.keys(state.pcb.traces).length;

  state.pushUndo();

  for (const [netId, connections] of Object.entries(netGroups)) {
    const obstacles = buildObstacleMap(netId, clearance);

    for (const conn of connections) {
      // Check if already routed
      const alreadyRouted = Object.values(state.pcb.traces).some(t =>
        t.netId === netId &&
        Math.abs(t.x1 - conn.x1) < 1 && Math.abs(t.y1 - conn.y1) < 1 &&
        Math.abs(t.x2 - conn.x2) < 1 && Math.abs(t.y2 - conn.y2) < 1
      );
      if (alreadyRouted) continue;

      const path = aStarRoute(conn.x1, conn.y1, conn.x2, conn.y2, obstacles);

      if (path && path.length >= 2) {
        // Convert path waypoints to trace segments
        for (let i = 0; i < path.length - 1; i++) {
          const traceId = `auto_trace_${++traceCounter}`;
          const trace = {
            id: traceId,
            x1: path[i].x, y1: path[i].y,
            x2: path[i + 1].x, y2: path[i + 1].y,
            layer,
            width: traceWidth,
            netId,
          };
          state.pcb.traces[traceId] = trace;
          newTraces.push(trace);

          // Add segments to obstacle map for subsequent routes
          const steps = Math.ceil(Math.hypot(trace.x2 - trace.x1, trace.y2 - trace.y1) / GRID_STEP) + 1;
          const cg = Math.ceil(clearance / GRID_STEP);
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            const gx = toGrid(trace.x1 + (trace.x2 - trace.x1) * t);
            const gy = toGrid(trace.y1 + (trace.y2 - trace.y1) * t);
            for (let dx = -cg; dx <= cg; dx++) {
              for (let dy = -cg; dy <= cg; dy++) {
                obstacles.add(gridKey(gx + dx, gy + dy));
              }
            }
          }
        }
        routed++;
      } else {
        failed++;
      }
    }
  }

  // Update ratsnest (remove routed connections)
  state.pcb.ratsnest = buildRatsnest(netlist).filter(rat => {
    return !Object.values(state.pcb.traces).some(t =>
      t.netId === rat.netId &&
      Math.hypot(t.x1 - rat.x1, t.y1 - rat.y1) < 2 &&
      Math.hypot(t.x2 - rat.x2, t.y2 - rat.y2) < 2
    );
  });

  return { routed, failed, traces: newTraces };
}

// ── Copper Pour (Zone Fill) ─────────────────────────────────────────────────

/**
 * Create a copper pour zone that fills the board area with copper
 * connected to a specified net, with thermal relief around pads.
 *
 * @param {string} netId - The net to connect the pour to (typically GND)
 * @param {Object} options - Pour options
 * @returns {Object} The created polygon zone
 */
export function createCopperPour(netId = null, options = {}) {
  const {
    layer = 'F.Cu',
    clearance = 0.3,
    thermalWidth = 0.25,
    thermalGap = 0.2,
    priority = 0,
    boundary = null, // custom boundary polygon [{x,y},...] or null for board outline
  } = options;

  const board = state.pcb.board;

  // Default boundary: board outline with margin
  const margin = 1.0;
  const pourBoundary = boundary ?? [
    { x: board.x + margin, y: board.y + margin },
    { x: board.x + board.width - margin, y: board.y + margin },
    { x: board.x + board.width - margin, y: board.y + board.height - margin },
    { x: board.x + margin, y: board.y + board.height - margin },
  ];

  // Build exclusion zones around traces and pads of different nets
  const exclusions = [];

  // Exclude traces from other nets
  for (const trace of Object.values(state.pcb.traces)) {
    if (trace.layer !== layer) continue;
    if (trace.netId === netId) continue;
    exclusions.push({
      type: 'trace',
      x1: trace.x1, y1: trace.y1,
      x2: trace.x2, y2: trace.y2,
      clearance: clearance + (trace.width || 0.25) / 2,
    });
  }

  // Exclude pads from other nets, mark thermal pads for same net
  const thermalPads = [];
  for (const pcbComp of Object.values(state.pcb.components)) {
    if (pcbComp.layer !== layer && pcbComp.layer !== 'F.Cu') continue;
    const fp = FOOTPRINT_MAP[pcbComp.footprintId];
    if (!fp) continue;
    for (const pad of fp.pads) {
      const wx = pcbComp.x + pad.x;
      const wy = pcbComp.y + pad.y;
      const padNet = pad.netId || _findPadNet(pcbComp.id, pad.number);

      if (padNet === netId) {
        // Same net: create thermal relief connection
        thermalPads.push({
          x: wx, y: wy,
          width: pad.padstack.width,
          height: pad.padstack.height,
          thermalWidth,
          thermalGap,
        });
      } else {
        // Different net: create exclusion
        exclusions.push({
          type: 'pad',
          x: wx, y: wy,
          width: pad.padstack.width + clearance * 2,
          height: pad.padstack.height + clearance * 2,
        });
      }
    }
  }

  // Exclude vias from other nets
  for (const via of Object.values(state.pcb.vias)) {
    if (via.netId === netId) {
      thermalPads.push({
        x: via.x, y: via.y,
        width: via.padDiameter,
        height: via.padDiameter,
        thermalWidth,
        thermalGap,
      });
    } else {
      exclusions.push({
        type: 'via',
        x: via.x, y: via.y,
        width: via.padDiameter + clearance * 2,
        height: via.padDiameter + clearance * 2,
      });
    }
  }

  const polygon = {
    id: `pour_${Date.now()}`,
    type: 'copper_pour',
    netId,
    layer,
    priority,
    boundary: pourBoundary,
    exclusions,
    thermalPads,
    clearance,
    thermalWidth,
    thermalGap,
    filled: true,
  };

  state.pushUndo();
  state.pcb.polygons.push(polygon);

  return polygon;
}

/**
 * Find the net connected to a specific pad by looking up schematic connections.
 */
function _findPadNet(compId, padNumber) {
  const comp = state.schematic.components[compId];
  if (!comp) return null;
  const pin = comp.pins.find(p => p.number === padNumber);
  return pin?.netId ?? null;
}

/**
 * Remove all copper pour zones.
 */
export function clearCopperPours() {
  state.pushUndo();
  state.pcb.polygons = state.pcb.polygons.filter(p => p.type !== 'copper_pour');
}

/**
 * Get fill status summary for all copper pours.
 */
export function getCopperPourSummary() {
  return state.pcb.polygons
    .filter(p => p.type === 'copper_pour')
    .map(p => ({
      id: p.id,
      netId: p.netId,
      layer: p.layer,
      exclusionCount: p.exclusions.length,
      thermalPadCount: p.thermalPads.length,
      area: _polygonArea(p.boundary),
    }));
}

function _polygonArea(points) {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j].x + points[i].x) * (points[j].y - points[i].y);
  }
  return Math.abs(area / 2);
}
