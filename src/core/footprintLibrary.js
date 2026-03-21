/**
 * AltiEDA – PCB Footprint Library
 * Maps footprint IDs to physical pad/courtyard data (all units in mm).
 */
import { createPadstack } from './dataModels.js';

// Helper: SMD pad
const smd = (num, x, y, w = 1.6, h = 0.9) => ({
  number: num, x, y,
  padstack: createPadstack('SMD', 'rect', w, h),
  netId: null,
});

// Helper: Through-hole pad
const th = (num, x, y, drill = 0.8, pad = 1.6) => ({
  number: num, x, y,
  padstack: createPadstack('TH', 'circle', pad, pad),
  netId: null,
});

// Helper: DIP row (dual-in-line pins)
function dipRow(startNum, count, x, yStart, pitch = 2.54) {
  return Array.from({ length: count }, (_, i) =>
    th(startNum + i, x, yStart + i * pitch));
}

export const FOOTPRINT_MAP = {
  // ── 0805 SMD Packages ──────────────────────────────────────────────────────
  R_0805: {
    id: 'R_0805',
    name: 'Resistor_SMD:R_0805',
    pads: [smd(1, -1.0, 0, 1.4, 1.0), smd(2, 1.0, 0, 1.4, 1.0)],
    courtyard: [[-1.7, -0.9], [1.7, -0.9], [1.7, 0.9], [-1.7, 0.9]],
    silkscreen: [{ x1: -0.5, y1: -0.7, x2: 0.5, y2: -0.7 }, { x1: -0.5, y1: 0.7, x2: 0.5, y2: 0.7 }],
    body3d: { width: 2.0, height: 1.2, depth: 0.6, offsetZ: 0 },
  },

  C_0805: {
    id: 'C_0805',
    name: 'Capacitor_SMD:C_0805',
    pads: [smd(1, -1.0, 0, 1.4, 1.0), smd(2, 1.0, 0, 1.4, 1.0)],
    courtyard: [[-1.8, -1.0], [1.8, -1.0], [1.8, 1.0], [-1.8, 1.0]],
    silkscreen: [{ x1: -0.4, y1: -0.8, x2: 0.4, y2: -0.8 }, { x1: -0.4, y1: 0.8, x2: 0.4, y2: 0.8 }],
    body3d: { width: 2.0, height: 1.2, depth: 1.1, offsetZ: 0 },
  },

  L_0805: {
    id: 'L_0805',
    name: 'Inductor_SMD:L_0805',
    pads: [smd(1, -1.0, 0, 1.4, 1.0), smd(2, 1.0, 0, 1.4, 1.0)],
    courtyard: [[-1.7, -0.9], [1.7, -0.9], [1.7, 0.9], [-1.7, 0.9]],
    silkscreen: [{ x1: -0.5, y1: -0.7, x2: 0.5, y2: -0.7 }, { x1: -0.5, y1: 0.7, x2: 0.5, y2: 0.7 }],
    body3d: { width: 2.0, height: 1.2, depth: 0.8, offsetZ: 0 },
  },

  LED_0805: {
    id: 'LED_0805',
    name: 'LED_SMD:LED_0805',
    pads: [smd(1, -1.0, 0, 1.4, 1.0), smd(2, 1.0, 0, 1.4, 1.0)],
    courtyard: [[-1.7, -0.9], [1.7, -0.9], [1.7, 0.9], [-1.7, 0.9]],
    silkscreen: [],
    body3d: { width: 2.0, height: 1.2, depth: 1.0, offsetZ: 0 },
  },

  // ── Diode Packages ─────────────────────────────────────────────────────────
  D_DO41: {
    id: 'D_DO41',
    name: 'Diode_THT:D_DO-41',
    pads: [th(1, -5.08, 0, 0.8, 1.4), th(2, 5.08, 0, 0.8, 1.4)],
    courtyard: [[-6.0, -1.5], [6.0, -1.5], [6.0, 1.5], [-6.0, 1.5]],
    silkscreen: [{ x1: -2.5, y1: -1.2, x2: 2.5, y2: -1.2 }, { x1: -2.5, y1: 1.2, x2: 2.5, y2: 1.2 },
                 { x1: -2.5, y1: -1.2, x2: -2.5, y2: 1.2 }, { x1: 2.5, y1: -1.2, x2: 2.5, y2: 1.2 },
                 { x1: 1.5, y1: -1.2, x2: 1.5, y2: 1.2 }],
    body3d: { width: 5.0, height: 2.4, depth: 2.4, offsetZ: 0 },
  },

  D_DO35: {
    id: 'D_DO35',
    name: 'Diode_THT:D_DO-35',
    pads: [th(1, -3.81, 0, 0.7, 1.2), th(2, 3.81, 0, 0.7, 1.2)],
    courtyard: [[-4.7, -1.2], [4.7, -1.2], [4.7, 1.2], [-4.7, 1.2]],
    silkscreen: [{ x1: -2.0, y1: -0.9, x2: 2.0, y2: -0.9 }, { x1: -2.0, y1: 0.9, x2: 2.0, y2: 0.9 },
                 { x1: -2.0, y1: -0.9, x2: -2.0, y2: 0.9 }, { x1: 2.0, y1: -0.9, x2: 2.0, y2: 0.9 }],
    body3d: { width: 4.0, height: 1.8, depth: 1.8, offsetZ: 0 },
  },

  // ── TO-92 (BJT, MOSFET, small regulators) ──────────────────────────────────
  TO92: {
    id: 'TO92',
    name: 'Package_TO_SOT_THT:TO-92',
    pads: [th(1, -1.27, 0, 0.7, 1.2), th(2, 0, 0, 0.7, 1.2), th(3, 1.27, 0, 0.7, 1.2)],
    courtyard: [[-2.6, -1.8], [2.6, -1.8], [2.6, 2.6], [-2.6, 2.6]],
    silkscreen: [{ x1: -2.0, y1: -1.5, x2: 2.0, y2: -1.5 }],
    body3d: { width: 4.5, height: 3.6, depth: 4.4, offsetZ: 0 },
  },

  // ── TO-220 (LM7805, LM317) ────────────────────────────────────────────────
  'TO220-3': {
    id: 'TO220-3',
    name: 'Package_TO_SOT_THT:TO-220-3',
    pads: [th(1, -2.54, 0, 1.0, 2.0), th(2, 0, 0, 1.0, 2.0), th(3, 2.54, 0, 1.0, 2.0)],
    courtyard: [[-5.5, -3.5], [5.5, -3.5], [5.5, 5.0], [-5.5, 5.0]],
    silkscreen: [{ x1: -5.0, y1: -3.0, x2: 5.0, y2: -3.0 }, { x1: -5.0, y1: 3.0, x2: 5.0, y2: 3.0 },
                 { x1: -5.0, y1: -3.0, x2: -5.0, y2: 3.0 }, { x1: 5.0, y1: -3.0, x2: 5.0, y2: 3.0 }],
    body3d: { width: 10.0, height: 4.5, depth: 15.0, offsetZ: 0 },
  },

  // ── SOT-223 (AMS1117) ──────────────────────────────────────────────────────
  SOT223: {
    id: 'SOT223',
    name: 'Package_TO_SOT_SMD:SOT-223',
    pads: [smd(1, -2.3, -1.65, 1.2, 1.8), smd(2, 0, -1.65, 1.2, 1.8),
           smd(3, 2.3, -1.65, 1.2, 1.8), smd(4, 0, 1.65, 3.5, 2.0)],
    courtyard: [[-3.5, -2.7], [3.5, -2.7], [3.5, 2.7], [-3.5, 2.7]],
    silkscreen: [{ x1: -2.5, y1: -0.8, x2: 2.5, y2: -0.8 }],
    body3d: { width: 6.5, height: 3.5, depth: 1.7, offsetZ: 0 },
  },

  // ── Button / Switch ────────────────────────────────────────────────────────
  SW_TACT_6mm: {
    id: 'SW_TACT_6mm',
    name: 'Button_Switch_THT:SW_TACT_6mm',
    pads: [th(1, -3.25, -2.25, 0.8, 1.4), th(2, -3.25, 2.25, 0.8, 1.4),
           th(3, 3.25, -2.25, 0.8, 1.4), th(4, 3.25, 2.25, 0.8, 1.4)],
    courtyard: [[-4.0, -3.0], [4.0, -3.0], [4.0, 3.0], [-4.0, 3.0]],
    silkscreen: [{ x1: -3.0, y1: -3.0, x2: 3.0, y2: -3.0 }, { x1: -3.0, y1: 3.0, x2: 3.0, y2: 3.0 },
                 { x1: -3.0, y1: -3.0, x2: -3.0, y2: 3.0 }, { x1: 3.0, y1: -3.0, x2: 3.0, y2: 3.0 }],
    body3d: { width: 6.0, height: 6.0, depth: 4.3, offsetZ: 0 },
  },

  // ── Crystal ────────────────────────────────────────────────────────────────
  Crystal_HC49: {
    id: 'Crystal_HC49',
    name: 'Crystal_THT:Crystal_HC49',
    pads: [th(1, -2.44, 0, 0.7, 1.4), th(2, 2.44, 0, 0.7, 1.4)],
    courtyard: [[-5.5, -2.0], [5.5, -2.0], [5.5, 2.0], [-5.5, 2.0]],
    silkscreen: [{ x1: -5.0, y1: -1.5, x2: 5.0, y2: -1.5 }, { x1: -5.0, y1: 1.5, x2: 5.0, y2: 1.5 },
                 { x1: -5.0, y1: -1.5, x2: -5.0, y2: 1.5 }, { x1: 5.0, y1: -1.5, x2: 5.0, y2: 1.5 }],
    body3d: { width: 11.0, height: 3.5, depth: 4.7, offsetZ: 0 },
  },

  // ── Buzzer ─────────────────────────────────────────────────────────────────
  Buzzer_12mm: {
    id: 'Buzzer_12mm',
    name: 'Buzzer:Buzzer_12mm',
    pads: [th(1, -3.25, 0, 0.8, 1.4), th(2, 3.25, 0, 0.8, 1.4)],
    courtyard: [[-7.0, -7.0], [7.0, -7.0], [7.0, 7.0], [-7.0, 7.0]],
    silkscreen: [],
    body3d: { width: 12.0, height: 12.0, depth: 9.0, offsetZ: 0 },
  },

  // ── Connectors ─────────────────────────────────────────────────────────────
  Connector_2pin_2_54mm: {
    id: 'Connector_2pin_2.54mm',
    name: 'Connector_PinHeader_1x02_P2.54mm',
    pads: [th(1, 0, -1.27, 1.0, 1.7), th(2, 0, 1.27, 1.0, 1.7)],
    courtyard: [[-1.8, -2.8], [1.8, -2.8], [1.8, 2.8], [-1.8, 2.8]],
    silkscreen: [{ x1: -1.3, y1: -2.3, x2: 1.3, y2: -2.3 }, { x1: -1.3, y1: 2.3, x2: 1.3, y2: 2.3 },
                 { x1: -1.3, y1: -2.3, x2: -1.3, y2: 2.3 }, { x1: 1.3, y1: -2.3, x2: 1.3, y2: 2.3 }],
    body3d: { width: 2.54, height: 5.08, depth: 8.5, offsetZ: 0 },
  },

  Connector_3pin_2_54mm: {
    id: 'Connector_3pin_2.54mm',
    name: 'Connector_PinHeader_1x03_P2.54mm',
    pads: [th(1, 0, -2.54, 1.0, 1.7), th(2, 0, 0, 1.0, 1.7), th(3, 0, 2.54, 1.0, 1.7)],
    courtyard: [[-1.8, -4.1], [1.8, -4.1], [1.8, 4.1], [-1.8, 4.1]],
    silkscreen: [{ x1: -1.3, y1: -3.6, x2: 1.3, y2: -3.6 }, { x1: -1.3, y1: 3.6, x2: 1.3, y2: 3.6 },
                 { x1: -1.3, y1: -3.6, x2: -1.3, y2: 3.6 }, { x1: 1.3, y1: -3.6, x2: 1.3, y2: 3.6 }],
    body3d: { width: 2.54, height: 7.62, depth: 8.5, offsetZ: 0 },
  },

  Connector_4pin_2_54mm: {
    id: 'Connector_4pin_2.54mm',
    name: 'Connector_PinHeader_1x04_P2.54mm',
    pads: [th(1, 0, -3.81, 1.0, 1.7), th(2, 0, -1.27, 1.0, 1.7),
           th(3, 0, 1.27, 1.0, 1.7), th(4, 0, 3.81, 1.0, 1.7)],
    courtyard: [[-1.8, -5.3], [1.8, -5.3], [1.8, 5.3], [-1.8, 5.3]],
    silkscreen: [{ x1: -1.3, y1: -4.8, x2: 1.3, y2: -4.8 }, { x1: -1.3, y1: 4.8, x2: 1.3, y2: 4.8 },
                 { x1: -1.3, y1: -4.8, x2: -1.3, y2: 4.8 }, { x1: 1.3, y1: -4.8, x2: 1.3, y2: 4.8 }],
    body3d: { width: 2.54, height: 10.16, depth: 8.5, offsetZ: 0 },
  },

  USB_Micro_B: {
    id: 'USB_Micro_B',
    name: 'Connector_USB:USB_Micro-B',
    pads: [smd(1, -1.3, -3.1, 0.4, 1.35), smd(2, -0.65, -3.1, 0.4, 1.35),
           smd(3, 0, -3.1, 0.4, 1.35), smd(4, 0.65, -3.1, 0.4, 1.35),
           smd(5, 1.3, -3.1, 0.4, 1.35)],
    courtyard: [[-4.0, -4.0], [4.0, -4.0], [4.0, 1.5], [-4.0, 1.5]],
    silkscreen: [{ x1: -3.5, y1: -3.5, x2: 3.5, y2: -3.5 }, { x1: -3.5, y1: 1.0, x2: 3.5, y2: 1.0 },
                 { x1: -3.5, y1: -3.5, x2: -3.5, y2: 1.0 }, { x1: 3.5, y1: -3.5, x2: 3.5, y2: 1.0 }],
    body3d: { width: 7.5, height: 5.0, depth: 2.7, offsetZ: 0 },
  },

  // ── Through-hole resistor for sensors ──────────────────────────────────────
  R_TH_5mm: {
    id: 'R_TH_5mm',
    name: 'Resistor_THT:R_Axial_5mm',
    pads: [th(1, -2.54, 0, 0.7, 1.2), th(2, 2.54, 0, 0.7, 1.2)],
    courtyard: [[-3.5, -1.2], [3.5, -1.2], [3.5, 1.2], [-3.5, 1.2]],
    silkscreen: [{ x1: -2.0, y1: -0.9, x2: 2.0, y2: -0.9 }, { x1: -2.0, y1: 0.9, x2: 2.0, y2: 0.9 },
                 { x1: -2.0, y1: -0.9, x2: -2.0, y2: 0.9 }, { x1: 2.0, y1: -0.9, x2: 2.0, y2: 0.9 }],
    body3d: { width: 5.0, height: 2.0, depth: 2.0, offsetZ: 0 },
  },

  // ── DIP packages ───────────────────────────────────────────────────────────
  DIP8: {
    id: 'DIP8',
    name: 'Package_DIP:DIP-8',
    pads: [...dipRow(1, 4, -3.81, -3.81, 2.54), ...dipRow(5, 4, 3.81, 3.81, -2.54)],
    courtyard: [[-5.5, -5.5], [5.5, -5.5], [5.5, 5.5], [-5.5, 5.5]],
    silkscreen: [{ x1: -5.0, y1: -5.0, x2: 5.0, y2: -5.0 }, { x1: -5.0, y1: 5.0, x2: 5.0, y2: 5.0 },
                 { x1: -5.0, y1: -5.0, x2: -5.0, y2: 5.0 }, { x1: 5.0, y1: -5.0, x2: 5.0, y2: 5.0 }],
    body3d: { width: 9.5, height: 10.0, depth: 3.4, offsetZ: 0 },
  },

  DIP16: {
    id: 'DIP16',
    name: 'Package_DIP:DIP-16',
    pads: [...dipRow(1, 8, -3.81, -8.89, 2.54), ...dipRow(9, 8, 3.81, 8.89, -2.54)],
    courtyard: [[-5.5, -10.5], [5.5, -10.5], [5.5, 10.5], [-5.5, 10.5]],
    silkscreen: [{ x1: -5.0, y1: -10.0, x2: 5.0, y2: -10.0 }, { x1: -5.0, y1: 10.0, x2: 5.0, y2: 10.0 },
                 { x1: -5.0, y1: -10.0, x2: -5.0, y2: 10.0 }, { x1: 5.0, y1: -10.0, x2: 5.0, y2: 10.0 }],
    body3d: { width: 9.5, height: 20.0, depth: 3.4, offsetZ: 0 },
  },

  DIP28: {
    id: 'DIP28',
    name: 'Package_DIP:DIP-28',
    pads: [...dipRow(1, 14, -3.81, -16.51, 2.54), ...dipRow(15, 14, 3.81, 16.51, -2.54)],
    courtyard: [[-5.5, -18.2], [5.5, -18.2], [5.5, 18.2], [-5.5, 18.2]],
    silkscreen: [{ x1: -5.0, y1: -17.7, x2: 5.0, y2: -17.7 }, { x1: -5.0, y1: 17.7, x2: 5.0, y2: 17.7 },
                 { x1: -5.0, y1: -17.7, x2: -5.0, y2: 17.7 }, { x1: 5.0, y1: -17.7, x2: 5.0, y2: 17.7 }],
    body3d: { width: 9.5, height: 35.5, depth: 3.4, offsetZ: 0 },
  },

  // ── Generic IC packages (for sensors, displays, etc.) ─────────────────────
  // MCUs, sensors, and other ICs without specific footprints use a generic QFN/module outline
  ESP32_WROOM_32: {
    id: 'ESP32_WROOM_32',
    name: 'RF_Module:ESP32-WROOM-32',
    pads: [
      ...Array.from({ length: 15 }, (_, i) => smd(i + 1, -9.2, -9.0 + i * 1.27, 1.6, 0.9)),
      ...Array.from({ length: 19 }, (_, i) => smd(i + 19, 9.2, 9.0 - i * 1.27, 1.6, 0.9)),
      smd(38, 0, 10.0, 3.5, 2.0),
    ],
    courtyard: [[-10.5, -10.5], [10.5, -10.5], [10.5, 10.5], [-10.5, 10.5]],
    silkscreen: [{ x1: -9.6, y1: -10.0, x2: 9.6, y2: -10.0 }, { x1: -9.6, y1: 10.0, x2: 9.6, y2: 10.0 }],
    body3d: { width: 18.0, height: 20.0, depth: 3.1, offsetZ: 0 },
  },

  BME280_LGA8: {
    id: 'BME280_LGA8',
    name: 'Bosch_LGA-8',
    pads: [
      smd(1, -0.975, -0.65, 0.7, 0.9), smd(2, -0.975, 0, 0.7, 0.9),
      smd(3, -0.975, 0.65, 0.7, 0.9), smd(4, 0, 1.0, 0.9, 0.7),
      smd(5, 0.975, 0.65, 0.7, 0.9), smd(6, 0.975, 0, 0.7, 0.9),
      smd(7, 0.975, -0.65, 0.7, 0.9), smd(8, 0, -1.0, 0.9, 0.7),
    ],
    courtyard: [[-1.65, -1.65], [1.65, -1.65], [1.65, 1.65], [-1.65, 1.65]],
    silkscreen: [],
    body3d: { width: 2.5, height: 2.5, depth: 0.93, offsetZ: 0 },
  },

  // ── Sensor/Display modules (generic pin header footprint) ──────────────────
  DHT22:         _moduleFootprint('DHT22', 4, 2.54),
  HC_SR04:       _moduleFootprint('HC_SR04', 4, 2.54),
  HC_SR501:      _moduleFootprint('HC_SR501', 3, 2.54),
  QFN24:         _moduleFootprint('QFN24', 6, 2.0),
  OLED_0_96in:   _moduleFootprint('OLED_0.96in', 4, 2.54),
  LCD_16x2:      _moduleFootprint('LCD_16x2', 16, 2.54),

  // ── Arduino / RPi / Module footprints (simplified as DIP-like headers) ─────
  Arduino_UNO_R3:   _moduleFootprint('Arduino_UNO_R3', 28, 2.54),
  Arduino_Nano:     _moduleFootprint('Arduino_Nano', 30, 2.54),
  Arduino_MEGA2560_R3: _moduleFootprint('Arduino_MEGA2560_R3', 36, 2.54),
  'ESP8266-12F':    _moduleFootprint('ESP8266-12F', 16, 2.0),
  LQFP48:           _moduleFootprint('LQFP48', 36, 1.0),
  RPi_Pico:         _moduleFootprint('RPi_Pico', 40, 2.54),

};

// ── Aliases: map dotted footprintIds to their underscore entries ─────────────
FOOTPRINT_MAP['Connector_2pin_2.54mm'] = FOOTPRINT_MAP.Connector_2pin_2_54mm;
FOOTPRINT_MAP['Connector_3pin_2.54mm'] = FOOTPRINT_MAP.Connector_3pin_2_54mm;
FOOTPRINT_MAP['Connector_4pin_2.54mm'] = FOOTPRINT_MAP.Connector_4pin_2_54mm;
FOOTPRINT_MAP['OLED_0.96in']          = FOOTPRINT_MAP.OLED_0_96in;

/** Generate a generic module footprint with N pins in dual rows */
function _moduleFootprint(id, pinCount, pitch) {
  const half = Math.ceil(pinCount / 2);
  const totalH = (half - 1) * pitch;
  const pads = [];
  for (let i = 0; i < half; i++) {
    pads.push(th(i + 1, -3.81, -totalH / 2 + i * pitch, 0.8, 1.5));
  }
  for (let i = 0; i < pinCount - half; i++) {
    pads.push(th(half + i + 1, 3.81, totalH / 2 - i * pitch, 0.8, 1.5));
  }
  const hW = 5.5, hH = totalH / 2 + 2;
  return {
    id,
    name: `Module:${id}`,
    pads,
    courtyard: [[-hW, -hH], [hW, -hH], [hW, hH], [-hW, hH]],
    silkscreen: [{ x1: -hW + 0.5, y1: -hH + 0.5, x2: hW - 0.5, y2: -hH + 0.5 },
                 { x1: -hW + 0.5, y1: hH - 0.5, x2: hW - 0.5, y2: hH - 0.5 },
                 { x1: -hW + 0.5, y1: -hH + 0.5, x2: -hW + 0.5, y2: hH - 0.5 },
                 { x1: hW - 0.5, y1: -hH + 0.5, x2: hW - 0.5, y2: hH - 0.5 }],
    body3d: { width: hW * 2, height: hH * 2, depth: 3.0, offsetZ: 0 },
  };
}
