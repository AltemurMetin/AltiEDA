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
