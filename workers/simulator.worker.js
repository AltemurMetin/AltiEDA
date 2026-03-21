/**
 * AltiEDA – Circuit Simulation Engine (MNA-based)
 *
 * Implements Modified Nodal Analysis for DC operating point and transient analysis.
 * Supports: R, C, L, V (DC), Diode (Shockley), BJT (Ebers-Moll), MOSFET (Level 1)
 *
 * Kirchhoff's Current Law (KCL):  Sum of currents at each node = 0
 * Kirchhoff's Voltage Law (KVL):  Sum of voltages around any loop = 0
 * Ohm's Law:                      V = I * R
 *
 * MNA stamps each element into [G]*[x] = [s] where:
 *   G = conductance matrix, x = unknowns (node voltages + source currents), s = RHS
 */

self.onmessage = function(e) {
  if (e.data.type === 'RUN_SIMULATION') {
    try {
      runSimulation(e.data.netlist, e.data.probeNets ?? []);
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: err.message });
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//  SPICE NETLIST PARSER
// ═══════════════════════════════════════════════════════════════════════════════

function parseNetlist(spice) {
  const elements = [];
  const models = {};
  let tranStep = 1e-6, tranStop = 10e-3;

  for (const raw of spice.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('*') || line.startsWith('.control') ||
        line === 'run' || line === '.endc' || line === '.end') continue;

    // .tran command
    const tranM = line.match(/^\.tran\s+([\d.eE+-]+)([umn]?s)\s+([\d.eE+-]+)([umn]?s)/i);
    if (tranM) {
      tranStep = parseTime(tranM[1], tranM[2]);
      tranStop = parseTime(tranM[3], tranM[4]);
      continue;
    }

    // .model directive
    const modelM = line.match(/^\.model\s+(\S+)\s+(D|NPN|PNP|NMOS|PMOS)\s*\(([^)]*)\)/i);
    if (modelM) {
      const name = modelM[1], type = modelM[2].toUpperCase();
      const params = {};
      for (const p of modelM[3].split(/\s+/)) {
        const kv = p.split('=');
        if (kv.length === 2) params[kv[0].toUpperCase()] = parseValue(kv[1]);
      }
      models[name] = { type, params };
      continue;
    }

    // Element lines: first char determines type
    const ch = line[0].toUpperCase();
    const parts = line.split(/\s+/);
    if (parts.length < 3) continue;

    const id = parts[0];
    switch (ch) {
      case 'R': // Rname n+ n- value
        elements.push({ type: 'R', id, nodes: [parts[1], parts[2]], value: parseValue(parts[3]) });
        break;
      case 'C': // Cname n+ n- value
        elements.push({ type: 'C', id, nodes: [parts[1], parts[2]], value: parseValue(parts[3]) });
        break;
      case 'L': // Lname n+ n- value
        elements.push({ type: 'L', id, nodes: [parts[1], parts[2]], value: parseValue(parts[3]) });
        break;
      case 'V': { // Vname n+ n- DC value
        let dc = 0;
        const dcIdx = parts.findIndex(p => p.toUpperCase() === 'DC');
        if (dcIdx >= 0 && parts[dcIdx + 1]) dc = parseValue(parts[dcIdx + 1]);
        else if (parts.length >= 4) dc = parseValue(parts[3]);
        elements.push({ type: 'V', id, nodes: [parts[1], parts[2]], value: dc });
        break;
      }
      case 'D': // Dname n+ n- modelname
        elements.push({ type: 'D', id, nodes: [parts[1], parts[2]], model: parts[3] });
        break;
      case 'Q': // Qname C B E modelname
        elements.push({ type: 'Q', id, nodes: [parts[1], parts[2], parts[3]], model: parts[4] });
        break;
      case 'M': // Mname D G S modelname
        elements.push({ type: 'M', id, nodes: [parts[1], parts[2], parts[3]], model: parts[4] });
        break;
    }
  }

  return { elements, models, tranStep, tranStop };
}

function parseValue(s) {
  if (!s) return 0;
  s = s.trim();
  const m = s.match(/^([+-]?[\d.eE+-]+)\s*([a-zA-ZΩµ]*)/);
  if (!m) return 0;
  let v = parseFloat(m[1]);
  const suffix = m[2].toLowerCase();
  const mults = { 'f':1e-15, 'p':1e-12, 'n':1e-9, 'u':1e-6, 'µ':1e-6,
                  'm':1e-3, 'k':1e3, 'meg':1e6, 'g':1e9, 't':1e12 };
  if (mults[suffix]) v *= mults[suffix];
  return v || 0;
}

function parseTime(val, unit) {
  const n = parseFloat(val);
  switch (unit) { case 'us': return n*1e-6; case 'ns': return n*1e-9; case 'ms': return n*1e-3; default: return n; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MATRIX OPERATIONS (dense, for small circuits)
// ═══════════════════════════════════════════════════════════════════════════════

function createMatrix(n) {
  const m = new Array(n);
  for (let i = 0; i < n; i++) m[i] = new Float64Array(n);
  return m;
}

function createVector(n) { return new Float64Array(n); }

function zeroMatrix(m) { for (let i = 0; i < m.length; i++) m[i].fill(0); }
function zeroVector(v) { v.fill(0); }
function copyVector(src) { return new Float64Array(src); }

/** Solve Ax=b using Gaussian elimination with partial pivoting */
function solve(A, b) {
  const n = b.length;
  // Make augmented copies
  const M = new Array(n);
  for (let i = 0; i < n; i++) {
    M[i] = new Float64Array(n + 1);
    M[i].set(A[i]);
    M[i][n] = b[i];
  }

  // Forward elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxVal = Math.abs(M[col][col]), maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > maxVal) { maxVal = Math.abs(M[row][col]); maxRow = row; }
    }
    if (maxVal < 1e-18) continue; // singular column
    if (maxRow !== col) { const tmp = M[col]; M[col] = M[maxRow]; M[maxRow] = tmp; }

    const pivot = M[col][col];
    for (let row = col + 1; row < n; row++) {
      const factor = M[row][col] / pivot;
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
    }
  }

  // Back substitution
  const x = createVector(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    x[i] = Math.abs(M[i][i]) > 1e-18 ? sum / M[i][i] : 0;
  }
  return x;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MNA ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

class MNAEngine {
  constructor(parsed) {
    this.elements = parsed.elements;
    this.models = parsed.models;

    // Build node map: name → index (0 = ground, indices start at 1)
    this.nodeMap = { '0': 0, 'GND': 0, 'gnd': 0 };
    this.nodeNames = ['0'];
    let idx = 1;
    for (const el of this.elements) {
      for (const n of el.nodes) {
        if (!(n in this.nodeMap)) {
          this.nodeMap[n] = idx++;
          this.nodeNames.push(n);
        }
      }
    }
    this.numNodes = idx - 1; // excluding ground

    // Count voltage sources and inductors (need extra MNA variables)
    this.vsources = [];
    this.inductors = [];
    let extraVars = 0;
    for (const el of this.elements) {
      if (el.type === 'V') { el.mnaIdx = this.numNodes + extraVars; this.vsources.push(el); extraVars++; }
      if (el.type === 'L') { el.mnaIdx = this.numNodes + extraVars; this.inductors.push(el); extraVars++; }
    }

    this.size = this.numNodes + extraVars;
    this.G = createMatrix(this.size);
    this.s = createVector(this.size);
    this.x = createVector(this.size);  // solution: [v1..vN, iV1..iVm, iL1..iLk]
    this.xPrev = createVector(this.size);

    // Capacitor companion model state (previous voltage)
    for (const el of this.elements) {
      if (el.type === 'C') el.vPrev = 0;
      if (el.type === 'L') el.iPrev = 0;
    }
  }

  /** Node index (0 for ground) */
  ni(name) { return this.nodeMap[name] ?? 0; }

  /** Row/column for node (shifted: ground is excluded, node 1 → index 0) */
  ri(name) { return this.ni(name) - 1; }

  /**
   * Stamp a conductance g between nodes n1 and n2.
   * KCL contribution: g*(v_n1 - v_n2) flows from n1 to n2
   */
  stampConductance(n1, n2, g) {
    const i = this.ri(n1), j = this.ri(n2);
    if (i >= 0) this.G[i][i] += g;
    if (j >= 0) this.G[j][j] += g;
    if (i >= 0 && j >= 0) { this.G[i][j] -= g; this.G[j][i] -= g; }
  }

  /** Stamp current source: current from n1 to n2 (positive into n2) */
  stampCurrentSource(n1, n2, I) {
    const i = this.ri(n1), j = this.ri(n2);
    if (i >= 0) this.s[i] -= I;
    if (j >= 0) this.s[j] += I;
  }

  /** Stamp voltage source: V(n+) - V(n-) = V, with extra variable at mnaIdx */
  stampVoltageSource(nPos, nNeg, V, mnaIdx) {
    const ip = this.ri(nPos), ineg = this.ri(nNeg);
    const k = mnaIdx; // row/col index in MNA matrix
    // KCL: current variable enters n+ and leaves n-
    if (ip >= 0) { this.G[ip][k] += 1; this.G[k][ip] += 1; }
    if (ineg >= 0) { this.G[ineg][k] -= 1; this.G[k][ineg] -= 1; }
    this.s[k] += V;
  }

  /** Get voltage at node */
  voltage(name) {
    const i = this.ri(name);
    return i >= 0 ? this.x[i] : 0;
  }

  /** Diode: Shockley equation with Newton-Raphson linearization */
  stampDiode(el) {
    const model = this.models[el.model] ?? { params: {} };
    const Is = model.params.IS ?? 1e-14;
    const N  = model.params.N ?? 1;
    const Rs = model.params.RS ?? 0;
    const BV = model.params.BV ?? 0;  // breakdown voltage (for Zener)
    const Vt = 0.02585; // thermal voltage at 300K
    const nVt = N * Vt;

    const vAnode   = this.voltage(el.nodes[0]);
    const vCathode = this.voltage(el.nodes[1]);
    let vd = vAnode - vCathode;

    // Clamp to prevent overflow
    if (vd > 0.8) vd = 0.8;
    if (BV > 0 && vd < -BV - 5) vd = -BV - 5;

    let Id, Gd;

    if (BV > 0 && vd < -BV) {
      // Zener breakdown region: exponential in reverse
      const vr = -(vd + BV);
      Id = -Is * (Math.exp(vr / nVt) - 1) - Is * (Math.exp(BV / nVt) - 1);
      Gd = Is / nVt * Math.exp(vr / nVt);
    } else {
      // Forward / normal reverse
      const expVd = Math.exp(vd / nVt);
      Id = Is * (expVd - 1);
      Gd = Is / nVt * expVd;
    }

    // Minimum conductance to aid convergence
    Gd = Math.max(Gd, 1e-12);

    // Series resistance contribution
    if (Rs > 0) {
      const Gs = 1 / Rs;
      // Simplified: treat as conductance in series
      const Geff = 1 / (1/Gd + Rs);
      const Ieq = Id - Gd * vd;
      this.stampConductance(el.nodes[0], el.nodes[1], Geff);
      this.stampCurrentSource(el.nodes[0], el.nodes[1], Ieq * Geff / Gd);
    } else {
      // Norton equivalent: Ieq = Id - Gd * Vd as current source + Gd as conductance
      const Ieq = Id - Gd * vd;
      this.stampConductance(el.nodes[0], el.nodes[1], Gd);
      this.stampCurrentSource(el.nodes[0], el.nodes[1], Ieq);
    }
  }

  /** NPN BJT: simplified Ebers-Moll model */
  stampBJT(el) {
    const model = this.models[el.model] ?? { params: {} };
    const isPNP = model.type === 'PNP';
    const BF = model.params.BF ?? 100;
    const IS = model.params.IS ?? 1e-14;
    const VAF = model.params.VAF ?? 100;
    const Vt = 0.02585;

    // Nodes: Q name C B E
    let vC = this.voltage(el.nodes[0]);
    let vB = this.voltage(el.nodes[1]);
    let vE = this.voltage(el.nodes[2]);

    if (isPNP) { vC = -vC; vB = -vB; vE = -vE; }

    let vBE = vB - vE;
    let vBC = vB - vC;
    // Clamp
    vBE = Math.min(vBE, 0.8);
    vBC = Math.min(vBC, 0.8);

    const expBE = Math.exp(vBE / Vt);
    const expBC = Math.exp(vBC / Vt);

    // Forward current: IC = IS*(exp(VBE/Vt)-1) * (1 + VCE/VAF)
    const vCE = vBE - vBC;
    const earlyFactor = 1 + Math.max(vCE, 0) / VAF;

    const If = IS * (expBE - 1) * earlyFactor;
    const Ir = IS * (expBC - 1);
    const Ib = If / BF + Ir / BF;
    const Ic = If - Ir;

    // Linearized conductances
    const gmf = IS / Vt * expBE * earlyFactor;  // dIc/dVbe
    const gmr = IS / Vt * expBC;                 // dIr/dVbc
    const gpi = gmf / BF;                        // dIb/dVbe
    const gmu = gmr / BF;                        // dIb/dVbc
    const go  = Math.max(If / VAF, 1e-12);       // dIc/dVce (Early effect)

    const cNode = el.nodes[0], bNode = el.nodes[1], eNode = el.nodes[2];
    const sign = isPNP ? -1 : 1;

    // gpi: B-E
    this.stampConductance(bNode, eNode, gpi);
    // gmu: B-C
    this.stampConductance(bNode, cNode, gmu);
    // go: C-E (output conductance)
    this.stampConductance(cNode, eNode, go);

    // Transconductance current source: gmf * vBE from E to C
    // Norton equivalent: Ieq_be = Ib - gpi*vBE, Ieq_ce = Ic - gmf*vBE + gmr*vBC - go*vCE
    const IeqBE = sign * (Ib - gpi * vBE - gmu * vBC);
    const IeqCE = sign * (Ic - gmf * vBE + gmr * vBC - go * vCE);

    this.stampCurrentSource(bNode, eNode, IeqBE * (gpi / (gpi + 1e-15)));
    this.stampCurrentSource(eNode, cNode, IeqCE);

    // gmf transconductance: controlled current source VBE → ICE
    // Stamp as: current from E to C proportional to V(B)-V(E)
    const ib = this.ri(bNode), ie = this.ri(eNode), ic = this.ri(cNode);
    if (ic >= 0 && ib >= 0) this.G[ic][ib] += sign * gmf;
    if (ic >= 0 && ie >= 0) this.G[ic][ie] -= sign * gmf;
    if (ie >= 0 && ib >= 0) this.G[ie][ib] -= sign * gmf;
    if (ie >= 0 && ie >= 0) this.G[ie][ie] += sign * gmf;

    // Remove double-counted conductance from stampConductance above for gmf
    // (gmf is a controlled source, not a conductance between C-E)
  }

  /** N-MOSFET Level 1 model */
  stampMOSFET(el) {
    const model = this.models[el.model] ?? { params: {} };
    const VTO = model.params.VTO ?? 1.5;
    const KP  = model.params.KP ?? 0.1;
    const isNMOS = model.type !== 'PMOS';

    // Nodes: M name D G S
    let vD = this.voltage(el.nodes[0]);
    let vG = this.voltage(el.nodes[1]);
    let vS = this.voltage(el.nodes[2]);

    if (!isNMOS) { vD = -vD; vG = -vG; vS = -vS; }

    let vGS = vG - vS;
    let vDS = vD - vS;
    if (vDS < 0) { vDS = -vDS; vGS = vG - vD; } // swap D and S

    let Id, gm, gds;

    if (vGS <= VTO) {
      // Cutoff
      Id = 0; gm = 0; gds = 1e-12;
    } else if (vDS < vGS - VTO) {
      // Linear (triode) region: Id = KP * ((VGS-VTO)*VDS - VDS^2/2)
      Id  = KP * ((vGS - VTO) * vDS - vDS * vDS / 2);
      gm  = KP * vDS;
      gds = KP * (vGS - VTO - vDS);
    } else {
      // Saturation: Id = KP/2 * (VGS-VTO)^2
      const vov = vGS - VTO;
      Id  = KP / 2 * vov * vov;
      gm  = KP * vov;
      gds = 1e-6; // small output conductance
    }

    gds = Math.max(gds, 1e-12);
    gm  = Math.max(gm, 0);

    const dNode = el.nodes[0], gNode = el.nodes[1], sNode = el.nodes[2];
    const sign = isNMOS ? 1 : -1;

    // gds: D-S conductance
    this.stampConductance(dNode, sNode, gds);

    // gm: controlled current source (VGS controls ID)
    const id = this.ri(dNode), ig = this.ri(gNode), is2 = this.ri(sNode);
    if (id >= 0 && ig >= 0) this.G[id][ig] += sign * gm;
    if (id >= 0 && is2 >= 0) this.G[id][is2] -= sign * gm;
    if (is2 >= 0 && ig >= 0) this.G[is2][ig] -= sign * gm;
    if (is2 >= 0 && is2 >= 0) this.G[is2][is2] += sign * gm;

    // Norton equivalent current
    const Ieq = sign * (Id - gm * vGS - gds * vDS);
    this.stampCurrentSource(sNode, dNode, Ieq);
  }

  /** Build MNA system for given timestep (dt=0 for DC) */
  buildSystem(dt) {
    zeroMatrix(this.G);
    zeroVector(this.s);

    for (const el of this.elements) {
      switch (el.type) {
        case 'R': {
          const g = 1 / Math.max(el.value, 1e-12);
          this.stampConductance(el.nodes[0], el.nodes[1], g);
          break;
        }
        case 'C': {
          if (dt > 0) {
            // Backward Euler companion model: G_eq = C/dt, I_eq = C/dt * v_prev
            const Geq = el.value / dt;
            this.stampConductance(el.nodes[0], el.nodes[1], Geq);
            const Ieq = Geq * el.vPrev;
            this.stampCurrentSource(el.nodes[1], el.nodes[0], Ieq);
          }
          // DC: capacitor is open circuit (no stamp)
          break;
        }
        case 'L': {
          if (dt > 0) {
            // Backward Euler: V = L*di/dt → companion: voltage source V = L/dt*(i-iPrev)
            // As MNA extra variable: stamp as V(n+)-V(n-) = L/dt * i_L - L/dt * iPrev
            // Equivalent resistor: Req = L/dt, Veq = L/dt * iPrev
            const Req = el.value / dt;
            const ip = this.ri(el.nodes[0]), ineg = this.ri(el.nodes[1]);
            const k = el.mnaIdx;
            // Voltage source with series resistance
            if (ip >= 0)   { this.G[ip][k] += 1; this.G[k][ip] += 1; }
            if (ineg >= 0) { this.G[ineg][k] -= 1; this.G[k][ineg] -= 1; }
            this.G[k][k] -= Req; // -L/dt * i_L on the equation row
            this.s[k] = -Req * el.iPrev; // = -L/dt * iPrev
          } else {
            // DC: inductor is short circuit (voltage source with V=0)
            const ip = this.ri(el.nodes[0]), ineg = this.ri(el.nodes[1]);
            const k = el.mnaIdx;
            if (ip >= 0)   { this.G[ip][k] += 1; this.G[k][ip] += 1; }
            if (ineg >= 0) { this.G[ineg][k] -= 1; this.G[k][ineg] -= 1; }
            this.s[k] = 0;
          }
          break;
        }
        case 'V': {
          this.stampVoltageSource(el.nodes[0], el.nodes[1], el.value, el.mnaIdx);
          break;
        }
        case 'D': {
          this.stampDiode(el);
          break;
        }
        case 'Q': {
          this.stampBJT(el);
          break;
        }
        case 'M': {
          this.stampMOSFET(el);
          break;
        }
      }
    }
  }

  /** Newton-Raphson iteration for nonlinear DC operating point */
  solveDC(maxIter = 100, tol = 1e-6) {
    // Initial guess: 0V everywhere
    this.x.fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
      this.buildSystem(0);
      const xNew = solve(this.G, this.s);

      // Check convergence
      let maxDiff = 0;
      for (let i = 0; i < this.size; i++) {
        maxDiff = Math.max(maxDiff, Math.abs(xNew[i] - this.x[i]));
      }
      this.x = xNew;

      if (maxDiff < tol) break;
    }

    // Set initial capacitor voltages from DC solution
    for (const el of this.elements) {
      if (el.type === 'C') {
        el.vPrev = this.voltage(el.nodes[0]) - this.voltage(el.nodes[1]);
      }
    }

    return this.x;
  }

  /** One transient step using Backward Euler + Newton-Raphson */
  stepTransient(dt, maxIter = 20, tol = 1e-6) {
    for (let iter = 0; iter < maxIter; iter++) {
      this.buildSystem(dt);
      const xNew = solve(this.G, this.s);

      let maxDiff = 0;
      for (let i = 0; i < this.size; i++) {
        maxDiff = Math.max(maxDiff, Math.abs(xNew[i] - this.x[i]));
      }
      this.x = xNew;

      if (maxDiff < tol) break;
    }

    // Update capacitor/inductor state for next step
    for (const el of this.elements) {
      if (el.type === 'C') {
        el.vPrev = this.voltage(el.nodes[0]) - this.voltage(el.nodes[1]);
      }
      if (el.type === 'L') {
        el.iPrev = this.x[el.mnaIdx];
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAIN SIMULATION RUNNER
// ═══════════════════════════════════════════════════════════════════════════════

function runSimulation(netlistStr, probeNets) {
  self.postMessage({ type: 'PROGRESS', percent: 5 });

  const parsed = parseNetlist(netlistStr);
  if (parsed.elements.length === 0) {
    self.postMessage({ type: 'ERROR', message: 'No circuit elements found in netlist' });
    return;
  }

  const engine = new MNAEngine(parsed);

  self.postMessage({ type: 'PROGRESS', percent: 10 });

  // ── DC Operating Point ──────────────────────────────────────────────────
  engine.solveDC();

  self.postMessage({ type: 'PROGRESS', percent: 20 });

  // ── Transient Analysis ──────────────────────────────────────────────────
  const dt = parsed.tranStep;
  const tStop = parsed.tranStop;
  const numPoints = Math.min(2000, Math.floor(tStop / dt));

  // Prepare result storage for all nodes
  const timeArr = new Array(numPoints);
  const nodeData = {}; // nodeName → { voltage: [], current: [] }

  // Track which nets to output
  const netsToProbe = probeNets.length > 0 ? probeNets : engine.nodeNames.filter(n => n !== '0');

  for (const netName of netsToProbe) {
    nodeData[netName] = { voltage: new Array(numPoints), current: new Array(numPoints) };
  }

  // Record DC point (t=0)
  timeArr[0] = 0;
  for (const netName of netsToProbe) {
    const v = engine.voltage(netName);
    nodeData[netName].voltage[0] = v;
    nodeData[netName].current[0] = 0;
  }

  // Step through time
  const progressInterval = Math.max(1, Math.floor(numPoints / 20));

  for (let step = 1; step < numPoints; step++) {
    const t = step * dt;
    timeArr[step] = t;

    engine.stepTransient(dt);

    for (const netName of netsToProbe) {
      nodeData[netName].voltage[step] = engine.voltage(netName);

      // Calculate branch current through the first component connected to this net
      // For voltage probes, current is estimated from node voltage changes
      const v = engine.voltage(netName);
      const vPrev = step > 0 ? nodeData[netName].voltage[step - 1] : v;
      // Simple current estimate: find a resistor on this net
      let current = 0;
      for (const el of engine.elements) {
        if (el.type === 'R' && (el.nodes[0] === netName || el.nodes[1] === netName)) {
          const v1 = engine.voltage(el.nodes[0]);
          const v2 = engine.voltage(el.nodes[1]);
          current = (v1 - v2) / el.value;
          if (el.nodes[1] === netName) current = -current;
          break;
        }
        if (el.type === 'V' && (el.nodes[0] === netName || el.nodes[1] === netName)) {
          current = engine.x[el.mnaIdx];
          break;
        }
      }
      nodeData[netName].current[step] = current;
    }

    if (step % progressInterval === 0) {
      self.postMessage({ type: 'PROGRESS', percent: 20 + Math.round(70 * step / numPoints) });
    }
  }

  self.postMessage({ type: 'PROGRESS', percent: 95 });

  // Package results
  const results = {};
  for (const netName of netsToProbe) {
    results[netName] = {
      time:    timeArr,
      voltage: nodeData[netName].voltage,
      current: nodeData[netName].current,
    };
  }

  self.postMessage({ type: 'PROGRESS', percent: 100 });
  self.postMessage({ type: 'RESULT', data: results });
}
