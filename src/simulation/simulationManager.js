/**
 * AltiEDA – Simulation Manager
 * Coordinates SPICE conversion, Web Worker execution, probe extraction,
 * and oscilloscope display.
 */
import { generateSPICENetlist } from './spiceConverter.js';
import { plotSimulationResults, initOscilloscope, showOscilloscope } from './oscilloscope.js';
import { state } from '../core/schematicState.js';

let _worker = null;
let _progressCb = null;

export function initSimulationManager(onProgress) {
  _progressCb = onProgress ?? (() => {});
}

export function runSimulation() {
  const netlist    = generateSPICENetlist();
  const probeNets  = Object.values(state.schematic.probes)
    .filter(p => p.netName)
    .map(p => p.netName);

  // Init oscilloscope on the canvas
  const oscCanvas = document.getElementById('osc-canvas');
  if (oscCanvas) initOscilloscope(oscCanvas);
  showOscilloscope();

  // Terminate any existing worker
  if (_worker) _worker.terminate();
  _worker = new Worker(new URL('../../workers/simulator.worker.js', import.meta.url), { type: 'module' });

  _worker.onmessage = e => {
    const msg = e.data;
    if (msg.type === 'PROGRESS') {
      _progressCb(msg.percent);
      document.getElementById('status-bar').textContent = `Simulating… ${msg.percent}%`;
    } else if (msg.type === 'RESULT') {
      _handleResults(msg.data);
      document.getElementById('status-bar').textContent = 'Simulation complete';
    } else if (msg.type === 'ERROR') {
      console.error('[Simulation Error]', msg.message);
      document.getElementById('status-bar').textContent = `Sim error: ${msg.message}`;
    }
  };

  _worker.postMessage({ type: 'RUN_SIMULATION', netlist, probeNets });
}

function _handleResults(data) {
  // Update probe data
  for (const probe of Object.values(state.schematic.probes)) {
    if (probe.netName && data[probe.netName]) {
      probe.data = data[probe.netName];
    }
  }

  // Plot all probed nets
  plotSimulationResults(data);
}
