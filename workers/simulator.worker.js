/**
 * AltiEDA – Simulation Web Worker
 *
 * Receives: { type: 'RUN_SIMULATION', netlist: string, probeNets: string[] }
 * Posts:    { type: 'RESULT', data: { netName: [timeArr, voltArr] } }
 *           { type: 'ERROR', message: string }
 *           { type: 'PROGRESS', percent: number }
 *
 * In production this worker would import and call ngspice.wasm.
 * For the architectural scaffold we generate a realistic synthetic waveform.
 */

self.onmessage = function(e) {
  const msg = e.data;

  if (msg.type === 'RUN_SIMULATION') {
    try {
      runSimulation(msg.netlist, msg.probeNets ?? []);
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: err.message });
    }
  }
};

function runSimulation(netlist, probeNets) {
  self.postMessage({ type: 'PROGRESS', percent: 5 });

  // ── Parse tran command ────────────────────────────────────────────────────
  const tranMatch = netlist.match(/\.tran\s+([\d.eE+-]+)([umn]?s)\s+([\d.eE+-]+)([umn]?s)/i);
  const stepTime  = tranMatch ? parseTime(tranMatch[1], tranMatch[2])  : 1e-6;
  const stopTime  = tranMatch ? parseTime(tranMatch[3], tranMatch[4])  : 10e-3;
  const numPoints = Math.min(2000, Math.floor(stopTime / stepTime));

  self.postMessage({ type: 'PROGRESS', percent: 20 });

  // Build time vector
  const time = new Float64Array(numPoints);
  for (let i = 0; i < numPoints; i++) time[i] = i * stepTime;

  self.postMessage({ type: 'PROGRESS', percent: 40 });

  // ── Detect voltage sources & generate waveforms ───────────────────────────
  const voltSources = parseVoltageSources(netlist);

  const results = {};

  // For each probed net, synthesise a waveform
  const netsToProbe = probeNets.length ? probeNets : ['VCC', 'GND', 'NET1'];

  netsToProbe.forEach((netName, ni) => {
    const volt    = new Float64Array(numPoints);
    const current = new Float64Array(numPoints);

    const src = voltSources.find(v => v.posNode === netName);
    const vdc = src ? src.dc : 3.3;    // default 3.3V

    for (let i = 0; i < numPoints; i++) {
      const t = time[i];
      // Superimpose DC + switching ripple + noise
      const ripple  = 0.02  * Math.sin(2 * Math.PI * 50   * t);   // 50Hz mains
      const noise   = 0.005 * (Math.random() - 0.5);
      const transient = (netName !== 'GND')
        ? vdc * (1 - Math.exp(-t / (0.5e-3))) + ripple + noise
        : noise;
      volt[i]    = transient;
      current[i] = transient / 100;    // assume 100Ω load
    }

    results[netName] = { time: Array.from(time), voltage: Array.from(volt), current: Array.from(current) };

    self.postMessage({ type: 'PROGRESS', percent: 40 + Math.round(50 * (ni + 1) / netsToProbe.length) });
  });

  self.postMessage({ type: 'PROGRESS', percent: 100 });
  self.postMessage({ type: 'RESULT', data: results });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseTime(val, unit) {
  const n = parseFloat(val);
  switch (unit) {
    case 'us': return n * 1e-6;
    case 'ms': return n * 1e-3;
    case 'ns': return n * 1e-9;
    default:   return n;
  }
}

function parseVoltageSources(netlist) {
  const sources = [];
  const re = /^V(\S+)\s+(\S+)\s+(\S+)\s+DC\s+([\d.]+)/gim;
  let m;
  while ((m = re.exec(netlist)) !== null) {
    sources.push({ name: m[1], posNode: m[2], negNode: m[3], dc: parseFloat(m[4]) });
  }
  return sources;
}
