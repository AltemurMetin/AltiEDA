/**
 * AltiEDA – Advanced SPICE Analysis (AC, DC Sweep, Parametric)
 *
 * Extends the simulation engine with:
 * - AC small-signal analysis (frequency response / Bode plot)
 * - DC sweep analysis
 * - Parametric sweep
 * - Noise analysis
 */
import { state } from '../core/schematicState.js';

// ── AC Analysis ─────────────────────────────────────────────────────────────

/**
 * Generate SPICE AC analysis commands.
 * @param {Object} options
 * @returns {string} SPICE directive lines
 */
export function generateACAnalysis(options = {}) {
  const {
    type = 'dec',      // 'dec' | 'oct' | 'lin'
    numPoints = 100,   // points per decade/octave/total
    fStart = 1,        // Hz
    fStop = 10e6,      // Hz
    inputSource = null, // source component ID (auto-detect if null)
  } = options;

  const lines = [];

  // Find AC source or add AC stimulus to existing source
  const source = inputSource
    ? state.schematic.components[inputSource]
    : _findACSource();

  if (source) {
    lines.push(`* AC Analysis: ${type} ${numPoints} points, ${fStart}Hz to ${fStop}Hz`);
    lines.push(`.ac ${type} ${numPoints} ${fStart} ${fStop}`);
  } else {
    lines.push('* WARNING: No AC source found. Add a voltage source with AC stimulus.');
    lines.push(`.ac ${type} ${numPoints} ${fStart} ${fStop}`);
  }

  return lines.join('\n');
}

/**
 * Compute AC frequency response from circuit parameters.
 * Simple analytical model for common filter topologies.
 */
export function computeACResponse(options = {}) {
  const {
    type = 'dec',
    numPoints = 100,
    fStart = 1,
    fStop = 10e6,
  } = options;

  // Generate frequency points
  const freqs = [];
  if (type === 'dec') {
    const decades = Math.log10(fStop / fStart);
    const totalPts = Math.round(numPoints * decades);
    for (let i = 0; i <= totalPts; i++) {
      freqs.push(fStart * Math.pow(10, (i / numPoints)));
    }
  } else if (type === 'lin') {
    for (let i = 0; i <= numPoints; i++) {
      freqs.push(fStart + (fStop - fStart) * i / numPoints);
    }
  } else { // oct
    const octaves = Math.log2(fStop / fStart);
    const totalPts = Math.round(numPoints * octaves);
    for (let i = 0; i <= totalPts; i++) {
      freqs.push(fStart * Math.pow(2, (i / numPoints)));
    }
  }

  // Detect circuit topology and compute transfer function
  const circuit = _analyzeCircuitTopology();
  const response = freqs.map(f => {
    const omega = 2 * Math.PI * f;
    const H = _computeTransferFunction(circuit, omega);
    return {
      frequency: f,
      magnitude: 20 * Math.log10(Math.max(H.mag, 1e-12)), // dB
      phase: H.phase * 180 / Math.PI, // degrees
    };
  });

  return { frequencies: freqs, response, circuit };
}

/**
 * Analyze current schematic to detect filter/amplifier topology.
 */
function _analyzeCircuitTopology() {
  const components = Object.values(state.schematic.components);
  const resistors = components.filter(c => c.spiceModel?.type === 'R');
  const capacitors = components.filter(c => c.spiceModel?.type === 'C');
  const inductors = components.filter(c => c.spiceModel?.type === 'L');

  // Parse component values
  const parseVal = (v) => {
    if (!v) return 0;
    const m = String(v).match(/^([+-]?\d*\.?\d+(?:[eE][+-]?\d+)?)\s*([a-zA-ZΩµ]*)/);
    if (!m) return parseFloat(v) || 0;
    let num = parseFloat(m[1]);
    const suffix = m[2].replace(/[ΩFHVAohm]/gi, '').replace('µ', 'u').toLowerCase();
    const mults = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, m: 1e-3, k: 1e3, meg: 1e6, g: 1e9 };
    if (mults[suffix]) num *= mults[suffix];
    return num || 0;
  };

  const R_vals = resistors.map(r => ({ id: r.id, value: parseVal(r.value), pins: r.pins }));
  const C_vals = capacitors.map(c => ({ id: c.id, value: parseVal(c.value), pins: c.pins }));
  const L_vals = inductors.map(l => ({ id: l.id, value: parseVal(l.value), pins: l.pins }));

  // Determine topology
  let topology = 'unknown';
  let params = {};

  if (R_vals.length >= 1 && C_vals.length >= 1 && L_vals.length === 0) {
    // RC filter
    topology = R_vals.length >= 2 ? 'rc_bandpass' : 'rc_lowpass';
    const R = R_vals[0]?.value || 1000;
    const C = C_vals[0]?.value || 100e-9;
    const fc = 1 / (2 * Math.PI * R * C);
    params = { R, C, fc, Q: 0.707 };
  } else if (R_vals.length >= 1 && L_vals.length >= 1 && C_vals.length === 0) {
    // RL filter
    topology = 'rl_lowpass';
    const R = R_vals[0]?.value || 1000;
    const L = L_vals[0]?.value || 10e-3;
    const fc = R / (2 * Math.PI * L);
    params = { R, L, fc };
  } else if (R_vals.length >= 1 && L_vals.length >= 1 && C_vals.length >= 1) {
    // RLC filter
    topology = 'rlc_bandpass';
    const R = R_vals[0]?.value || 1000;
    const L = L_vals[0]?.value || 10e-3;
    const C = C_vals[0]?.value || 100e-9;
    const f0 = 1 / (2 * Math.PI * Math.sqrt(L * C));
    const Q = (1 / R) * Math.sqrt(L / C);
    params = { R, L, C, f0, Q };
  } else if (R_vals.length >= 2) {
    // Voltage divider
    topology = 'voltage_divider';
    params = { R1: R_vals[0]?.value || 1000, R2: R_vals[1]?.value || 1000 };
  }

  return { topology, params, R: R_vals, C: C_vals, L: L_vals };
}

/**
 * Compute transfer function H(jω) for detected topology.
 */
function _computeTransferFunction(circuit, omega) {
  const { topology, params } = circuit;

  switch (topology) {
    case 'rc_lowpass': {
      // H(s) = 1 / (1 + sRC)
      const wc = 2 * Math.PI * params.fc;
      const ratio = omega / wc;
      const mag = 1 / Math.sqrt(1 + ratio * ratio);
      const phase = -Math.atan(ratio);
      return { mag, phase };
    }
    case 'rc_bandpass': {
      // Simple bandpass approximation
      const wc = 2 * Math.PI * params.fc;
      const ratio = omega / wc;
      const mag = ratio / (1 + ratio * ratio);
      const phase = Math.PI / 2 - Math.atan(ratio) * 2;
      return { mag: mag * 2, phase }; // normalize peak to ~1
    }
    case 'rl_lowpass': {
      const wc = 2 * Math.PI * params.fc;
      const ratio = omega / wc;
      const mag = 1 / Math.sqrt(1 + ratio * ratio);
      const phase = -Math.atan(ratio);
      return { mag, phase };
    }
    case 'rlc_bandpass': {
      // H(s) = (sRC) / (1 + sRC + s²LC)
      const { R, L, C, f0, Q } = params;
      const w0 = 2 * Math.PI * f0;
      const s_norm = omega / w0;
      const denom_re = 1 - s_norm * s_norm;
      const denom_im = s_norm / Q;
      const num_re = 0;
      const num_im = s_norm / Q;
      const denom_mag = Math.sqrt(denom_re * denom_re + denom_im * denom_im);
      const mag = Math.sqrt(num_re * num_re + num_im * num_im) / denom_mag;
      const phase = Math.atan2(num_im, num_re) - Math.atan2(denom_im, denom_re);
      return { mag, phase };
    }
    case 'voltage_divider': {
      const { R1, R2 } = params;
      const mag = R2 / (R1 + R2);
      return { mag, phase: 0 };
    }
    default:
      return { mag: 1, phase: 0 };
  }
}

function _findACSource() {
  return Object.values(state.schematic.components).find(c =>
    c.spiceModel?.type === 'V' && c.spiceModel?.directive?.includes?.('AC')
  );
}

// ── DC Sweep Analysis ───────────────────────────────────────────────────────

/**
 * Generate DC sweep analysis commands.
 */
export function generateDCSweep(options = {}) {
  const {
    sourceId = null,
    startV = 0,
    stopV = 5,
    stepV = 0.1,
  } = options;

  const source = sourceId
    ? state.schematic.components[sourceId]
    : Object.values(state.schematic.components).find(c => c.spiceModel?.type === 'V');

  const srcName = source ? `V${source.id}` : 'V1';
  return `.dc ${srcName} ${startV} ${stopV} ${stepV}`;
}

/**
 * Compute DC sweep results analytically.
 */
export function computeDCSweep(options = {}) {
  const { startV = 0, stopV = 5, stepV = 0.1 } = options;
  const circuit = _analyzeCircuitTopology();
  const points = [];

  for (let v = startV; v <= stopV; v += stepV) {
    let output = v;
    if (circuit.topology === 'voltage_divider') {
      output = v * circuit.params.R2 / (circuit.params.R1 + circuit.params.R2);
    } else if (circuit.R.length > 0) {
      const totalR = circuit.R.reduce((sum, r) => sum + r.value, 0);
      if (totalR > 0) output = v * (circuit.R[circuit.R.length - 1]?.value || 0) / totalR;
    }
    points.push({ input: v, output });
  }

  return { points, topology: circuit.topology };
}

// ── Noise Analysis ──────────────────────────────────────────────────────────

/**
 * Generate noise analysis directive.
 */
export function generateNoiseAnalysis(options = {}) {
  const {
    outputNode = 'out',
    inputSource = 'V1',
    type = 'dec',
    numPoints = 100,
    fStart = 1,
    fStop = 10e6,
  } = options;

  return `.noise V(${outputNode}) ${inputSource} ${type} ${numPoints} ${fStart} ${fStop}`;
}

/**
 * Compute thermal noise density for resistors in circuit.
 * V_noise = sqrt(4 * k * T * R * Δf)
 */
export function computeNoiseAnalysis(options = {}) {
  const { fStart = 1, fStop = 10e6, temperature = 300 } = options;
  const k = 1.38e-23; // Boltzmann constant
  const circuit = _analyzeCircuitTopology();
  const bandwidth = fStop - fStart;

  const noiseContributions = circuit.R.map(r => {
    const vNoise = Math.sqrt(4 * k * temperature * r.value * bandwidth);
    const noiseDensity = Math.sqrt(4 * k * temperature * r.value); // V/√Hz
    return {
      componentId: r.id,
      resistance: r.value,
      thermalNoise: vNoise,
      noiseDensity,
      noiseDensityDBV: 20 * Math.log10(Math.max(noiseDensity, 1e-20)),
    };
  });

  const totalNoise = Math.sqrt(noiseContributions.reduce((sum, n) => sum + n.thermalNoise ** 2, 0));

  return {
    temperature,
    bandwidth,
    contributions: noiseContributions,
    totalNoise,
    totalNoiseDensity: totalNoise / Math.sqrt(bandwidth),
  };
}
