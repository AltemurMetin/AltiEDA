/**
 * AltiEDA – Oscilloscope / Graph Window
 * Uses Chart.js to plot simulation results.
 */
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

let _chart = null;

export function initOscilloscope(canvasEl) {
  if (_chart) { _chart.destroy(); _chart = null; }

  _chart = new Chart(canvasEl, {
    type: 'line',
    data: {
      labels:   [],
      datasets: [],
    },
    options: {
      animation:   false,
      responsive:  true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#e0e0e0', font: { size: 11 } } },
        title:  { display: true, text: 'Oscilloscope – Simulation Results', color: '#e0e0e0' },
      },
      scales: {
        x: {
          title: { display: true, text: 'Time (µs)', color: '#888' },
          ticks: { color: '#888', maxTicksLimit: 12, callback: v => (parseFloat(v) * 1e6).toFixed(1) },
          grid:  { color: '#1e2040' },
        },
        y: {
          title: { display: true, text: 'Voltage (V)', color: '#888' },
          ticks: { color: '#888' },
          grid:  { color: '#1e2040' },
        },
      },
    },
  });

  return _chart;
}

const COLORS = ['#00b4d8', '#f44336', '#4caf50', '#ffc107', '#9c27b0', '#ff5722'];

export function plotSimulationResults(results) {
  if (!_chart) return;

  const nets    = Object.keys(results);
  if (!nets.length) return;
  const time    = results[nets[0]].time;

  _chart.data.labels = time;

  _chart.data.datasets = nets.map((netName, i) => ({
    label:           `${netName} [V]`,
    data:            results[netName].voltage,
    borderColor:     COLORS[i % COLORS.length],
    backgroundColor: COLORS[i % COLORS.length] + '22',
    borderWidth:     1.5,
    pointRadius:     0,
    tension:         0.1,
    fill:            false,
  }));

  _chart.update();
}

export function showOscilloscope() {
  document.getElementById('oscilloscope-panel')?.classList.remove('hidden');
}

export function hideOscilloscope() {
  document.getElementById('oscilloscope-panel')?.classList.add('hidden');
}

// ── Bode Plot (AC Frequency Response) ─────────────────────────────────────

export function plotACResponse(acResult) {
  const oscCanvas = document.getElementById('osc-canvas');
  if (!oscCanvas) return;

  if (_chart) { _chart.destroy(); _chart = null; }

  const { response, circuit } = acResult;
  const freqLabels = response.map(r => r.frequency);

  _chart = new Chart(oscCanvas, {
    type: 'line',
    data: {
      labels: freqLabels,
      datasets: [
        {
          label: 'Magnitude (dB)',
          data: response.map(r => r.magnitude),
          borderColor: '#00b4d8',
          backgroundColor: '#00b4d822',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: false,
          yAxisID: 'yMag',
        },
        {
          label: 'Phase (°)',
          data: response.map(r => r.phase),
          borderColor: '#f44336',
          backgroundColor: '#f4433622',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.3,
          borderDash: [5, 3],
          fill: false,
          yAxisID: 'yPhase',
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#e0e0e0', font: { size: 11 } } },
        title: {
          display: true,
          text: `Bode Plot – ${circuit.topology.replace(/_/g, ' ').toUpperCase()}${circuit.params.fc ? ` (fc = ${_formatFreq(circuit.params.fc)})` : circuit.params.f0 ? ` (f₀ = ${_formatFreq(circuit.params.f0)})` : ''}`,
          color: '#e0e0e0',
        },
      },
      scales: {
        x: {
          type: 'logarithmic',
          title: { display: true, text: 'Frequency (Hz)', color: '#888' },
          ticks: {
            color: '#888',
            maxTicksLimit: 10,
            callback: v => _formatFreq(v),
          },
          grid: { color: '#1e2040' },
        },
        yMag: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Magnitude (dB)', color: '#00b4d8' },
          ticks: { color: '#00b4d8' },
          grid: { color: '#1e2040' },
        },
        yPhase: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Phase (°)', color: '#f44336' },
          ticks: { color: '#f44336' },
          grid: { drawOnChartArea: false },
        },
      },
    },
  });

  showOscilloscope();
}

// ── DC Sweep Plot ─────────────────────────────────────────────────────────

export function plotDCSweep(dcResult) {
  const oscCanvas = document.getElementById('osc-canvas');
  if (!oscCanvas) return;

  if (_chart) { _chart.destroy(); _chart = null; }

  const { points, topology } = dcResult;

  _chart = new Chart(oscCanvas, {
    type: 'line',
    data: {
      labels: points.map(p => p.input),
      datasets: [
        {
          label: 'Output (V)',
          data: points.map(p => p.output),
          borderColor: '#4caf50',
          backgroundColor: '#4caf5022',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: true,
        },
        {
          label: 'Input (V)',
          data: points.map(p => p.input),
          borderColor: '#888888',
          borderWidth: 1,
          pointRadius: 0,
          borderDash: [4, 4],
          fill: false,
        },
      ],
    },
    options: {
      animation: false,
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#e0e0e0', font: { size: 11 } } },
        title: {
          display: true,
          text: `DC Sweep – ${topology.replace(/_/g, ' ')}`,
          color: '#e0e0e0',
        },
      },
      scales: {
        x: {
          title: { display: true, text: 'Input Voltage (V)', color: '#888' },
          ticks: { color: '#888', maxTicksLimit: 12 },
          grid: { color: '#1e2040' },
        },
        y: {
          title: { display: true, text: 'Output Voltage (V)', color: '#888' },
          ticks: { color: '#888' },
          grid: { color: '#1e2040' },
        },
      },
    },
  });

  showOscilloscope();
}

function _formatFreq(f) {
  if (f >= 1e6) return (f / 1e6).toFixed(1) + 'M';
  if (f >= 1e3) return (f / 1e3).toFixed(1) + 'k';
  if (f >= 1) return f.toFixed(0);
  if (f >= 1e-3) return (f * 1e3).toFixed(1) + 'm';
  return f.toExponential(1);
}
