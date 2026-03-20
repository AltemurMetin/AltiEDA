/**
 * AltiEDA – Contextual Resource Panel
 * Mock data + tabbed UI for component specs, StackOverflow, GitHub Issues.
 */

// ── Mock component data ────────────────────────────────────────────────────────
const MOCK_COMPONENT_DATA = {
  ESP32_WROOM: {
    partName:    'ESP32-WROOM-32',
    description: 'Dual-core Xtensa LX6 MCU with Wi-Fi & Bluetooth, 520KB SRAM, 4MB Flash.',
    datasheetUrl: 'https://www.espressif.com/sites/default/files/documentation/esp32-wroom-32_datasheet_en.pdf',
    specs: {
      'Supply Voltage':   '3.0V – 3.6V',
      'Max Current (TX)': '500 mA',
      'Operating Temp':   '-40°C to +85°C',
      'Flash':            '4 MB',
      'SRAM':             '520 KB',
      'CPU':              'Xtensa LX6 Dual-Core @ 240 MHz',
      'Wi-Fi':            '802.11 b/g/n 2.4 GHz',
      'Bluetooth':        'BT 4.2 / BLE',
      'GPIO':             '34 programmable',
      'ADC':              '18 ch × 12-bit SAR',
    },
    communityInsights: [
      {
        title:   'ESP32 I2C pull-up resistor value',
        body:    'Use 4.7 kΩ pull-ups on SDA/SCL for I2C at 400 kHz. Lower to 2.2 kΩ if you have long traces or multiple slaves.',
        votes:   347,
        url:     'https://stackoverflow.com/q/12345678',
      },
      {
        title:   'Brownout reset when Wi-Fi transmits',
        body:    'Add 100 µF electrolytic + 100 nF ceramic capacitor close to 3V3 pin. The TX burst can draw 500 mA spikes.',
        votes:   215,
        url:     'https://stackoverflow.com/q/23456789',
      },
      {
        title:   'GPIO36/39 input-only – no pull-up',
        body:    'GPIO34-39 are input-only and lack internal pull-up/pull-down. Use external resistors or choose another pin.',
        votes:   180,
        url:     'https://stackoverflow.com/q/34567890',
      },
    ],
    githubIssues: [
      { title: 'ADC non-linearity near 3.3V rail', state: 'open',   url: '#' },
      { title: 'Wi-Fi + ADC2 mutual exclusion',     state: 'closed', url: '#' },
      { title: 'Crystal oscillator startup failure at low temp', state: 'open', url: '#' },
      { title: 'GPIO12 boot mode – must be LOW on power-up',    state: 'closed', url: '#' },
    ],
  },

  BME280: {
    partName:    'BME280',
    description: 'Bosch combined digital humidity, pressure, and temperature sensor in LGA-8.',
    datasheetUrl: 'https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bme280-ds002.pdf',
    specs: {
      'Supply Voltage':  '1.71V – 3.6V',
      'Max Current':     '3.6 µA @ 1 Hz weather',
      'Pressure':        '300 – 1100 hPa ±1 hPa',
      'Temperature':     '-40°C to +85°C ±0.5°C',
      'Humidity':        '0 – 100 % RH ±3 %',
      'Interface':       'I2C / SPI',
      'Package':         'LGA-8 2.5×2.5 mm',
    },
    communityInsights: [
      {
        title:   'BME280 I2C address selection (SDO pin)',
        body:    'Pull SDO to GND for address 0x76, pull to VCC for 0x77. Ensure your library uses the correct address.',
        votes:   289,
        url:     'https://stackoverflow.com/q/45678901',
      },
      {
        title:   'Humidity reads 100% after soldering',
        body:    'Reflow flux residue can contaminate the sensing element. Clean board with IPA and cure at 100°C for 30 min.',
        votes:   134,
        url:     'https://stackoverflow.com/q/56789012',
      },
    ],
    githubIssues: [
      { title: 'Compensated temperature wrong at -40°C edge case', state: 'closed', url: '#' },
      { title: 'SPI mode 0 vs mode 3 compatibility',               state: 'open',   url: '#' },
    ],
  },

  AMS1117_3V3: {
    partName:    'AMS1117-3.3',
    description: '1A low-dropout linear voltage regulator, 3.3V fixed output.',
    datasheetUrl: 'https://www.advanced-monolithic.com/pdf/ds1117.pdf',
    specs: {
      'Output Voltage':   '3.3V ±1%',
      'Input Voltage':    '4.75V – 15V',
      'Max Output Current': '1 A',
      'Dropout Voltage':  '1.3V @ 1A',
      'Package':          'SOT-223',
    },
    communityInsights: [
      {
        title:   'AMS1117 output capacitor requirement',
        body:    'Requires minimum 10 µF output cap (tantalum or low-ESR electrolytic) for stability. Add 100 nF ceramic in parallel.',
        votes:   412,
        url:     'https://stackoverflow.com/q/67890123',
      },
    ],
    githubIssues: [
      { title: 'Oscillation with ceramic-only output capacitor', state: 'open', url: '#' },
    ],
  },
};

// ── State ──────────────────────────────────────────────────────────────────────
let _activeTab = 'specs';
let _panelVisible = false;

// ── Panel DOM refs ─────────────────────────────────────────────────────────────
const panel        = () => document.getElementById('panel-right');
const tabSpecs     = () => document.getElementById('tab-specs');
const tabSO        = () => document.getElementById('tab-stackoverflow');
const tabGH        = () => document.getElementById('tab-github');

// ── Mock fetch ────────────────────────────────────────────────────────────────
function mockFetch(componentId) {
  return new Promise(resolve => {
    // Simulate 150ms API latency
    setTimeout(() => resolve(MOCK_COMPONENT_DATA[componentId] ?? null), 150);
  });
}

// ── Event: component selected on canvas ──────────────────────────────────────
export async function onComponentSelect(componentId) {
  const data = await mockFetch(componentId);
  if (!data) return;

  renderPanel(data);
  showPanel();
}

// ── Render panel ──────────────────────────────────────────────────────────────
function renderPanel(data) {
  // Specs tab
  let specsHtml = `
    <p style="margin-bottom:8px;color:#aaa;font-size:11px">${data.description}</p>
    <a href="${data.datasheetUrl}" target="_blank"
       style="color:#00b4d8;font-size:11px;text-decoration:none">
      📄 Open Datasheet
    </a>
    <div style="margin-top:10px">`;
  for (const [k, v] of Object.entries(data.specs)) {
    specsHtml += `
      <div class="spec-row">
        <span class="spec-label">${k}</span>
        <span class="spec-value">${v}</span>
      </div>`;
  }
  specsHtml += '</div>';
  tabSpecs().innerHTML = specsHtml;

  // StackOverflow tab
  let soHtml = '';
  for (const ins of data.communityInsights) {
    soHtml += `
      <div class="insight-card">
        <div class="insight-title">
          <a href="${ins.url}" target="_blank" style="color:#e0e0e0;text-decoration:none">
            ${ins.title}
          </a>
        </div>
        <div class="insight-body">${ins.body}</div>
        <div class="insight-votes">▲ ${ins.votes} votes</div>
      </div>`;
  }
  tabSO().innerHTML = soHtml || '<p style="color:#666;padding:10px">No insights available.</p>';

  // GitHub Issues tab
  let ghHtml = '';
  for (const issue of data.githubIssues) {
    ghHtml += `
      <div class="gh-issue">
        <span class="gh-issue-state ${issue.state}">${issue.state}</span>
        <a href="${issue.url}" target="_blank" style="color:#e0e0e0;text-decoration:none">
          ${issue.title}
        </a>
      </div>`;
  }
  tabGH().innerHTML = ghHtml || '<p style="color:#666;padding:10px">No issues found.</p>';
}

// ── Show / Hide ────────────────────────────────────────────────────────────────
function showPanel() {
  const p = panel();
  p.classList.remove('hidden');
  requestAnimationFrame(() => p.classList.add('visible'));
  _panelVisible = true;
}

export function hidePanel() {
  const p = panel();
  p.classList.remove('visible');
  setTimeout(() => p.classList.add('hidden'), 300);
  _panelVisible = false;
}

// ── Tab switching ─────────────────────────────────────────────────────────────
export function initPanel() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
      document.getElementById(`tab-${tab}`)?.classList.remove('hidden');
      _activeTab = tab;
    });
  });

  document.getElementById('btn-close-info')?.addEventListener('click', hidePanel);
}
