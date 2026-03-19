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

export const FOOTPRINT_MAP = {
  // ── 0805 Resistor ──────────────────────────────────────────────────────────
  R_0805: {
    id: 'R_0805',
    name: 'Resistor_SMD:R_0805_2012Metric',
    pads: [smd(1, -1.0, 0, 1.4, 1.0), smd(2, 1.0, 0, 1.4, 1.0)],
    courtyard: [[-1.7, -0.9], [1.7, -0.9], [1.7, 0.9], [-1.7, 0.9]],
    silkscreen: [{ x1: -0.5, y1: -0.7, x2: 0.5, y2: -0.7 }, { x1: -0.5, y1: 0.7, x2: 0.5, y2: 0.7 }],
    body3d: { width: 2.0, height: 1.2, depth: 0.6, offsetZ: 0 },
  },

  // ── 0805 Capacitor ────────────────────────────────────────────────────────
  C_0805: {
    id: 'C_0805',
    name: 'Capacitor_SMD:C_0805_2012Metric',
    pads: [smd(1, -1.0, 0, 1.4, 1.0), smd(2, 1.0, 0, 1.4, 1.0)],
    courtyard: [[-1.8, -1.0], [1.8, -1.0], [1.8, 1.0], [-1.8, 1.0]],
    silkscreen: [{ x1: -0.4, y1: -0.8, x2: 0.4, y2: -0.8 }, { x1: -0.4, y1: 0.8, x2: 0.4, y2: 0.8 }],
    body3d: { width: 2.0, height: 1.2, depth: 1.1, offsetZ: 0 },
  },

  // ── LED 0805 ──────────────────────────────────────────────────────────────
  LED_0805: {
    id: 'LED_0805',
    name: 'LED_SMD:LED_0805_2012Metric',
    pads: [smd(1, -1.0, 0, 1.4, 1.0), smd(2, 1.0, 0, 1.4, 1.0)],
    courtyard: [[-1.7, -0.9], [1.7, -0.9], [1.7, 0.9], [-1.7, 0.9]],
    silkscreen: [],
    body3d: { width: 2.0, height: 1.2, depth: 1.0, offsetZ: 0 },
  },

  // ── SOT223 (AMS1117) ──────────────────────────────────────────────────────
  SOT223: {
    id: 'SOT223',
    name: 'Package_TO_SOT_SMD:SOT-223-3_TabPin2',
    pads: [
      smd(1, -2.3, -1.65, 1.2, 1.8),
      smd(2, 0,    -1.65, 1.2, 1.8),
      smd(3, 2.3,  -1.65, 1.2, 1.8),
      smd(4, 0,     1.65, 3.5, 2.0),  // Tab
    ],
    courtyard: [[-3.5, -2.7], [3.5, -2.7], [3.5, 2.7], [-3.5, 2.7]],
    silkscreen: [{ x1: -2.5, y1: -0.8, x2: 2.5, y2: -0.8 }],
    body3d: { width: 6.5, height: 3.5, depth: 1.7, offsetZ: 0 },
  },

  // ── ESP32-WROOM-32 ────────────────────────────────────────────────────────
  ESP32_WROOM_32: {
    id: 'ESP32_WROOM_32',
    name: 'RF_Module:ESP32-WROOM-32',
    pads: [
      // Left side pins (1-15 from bottom-left going up)
      ...Array.from({ length: 15 }, (_, i) => smd(i + 1, -9.2, -9.0 + i * 1.27, 1.6, 0.9)),
      // Right side (19-38 going down)
      ...Array.from({ length: 19 }, (_, i) => smd(i + 19, 9.2, 9.0 - i * 1.27, 1.6, 0.9)),
      // Bottom GND pads
      smd(38, 0, 10.0, 3.5, 2.0),
    ],
    courtyard: [[-10.5, -10.5], [10.5, -10.5], [10.5, 10.5], [-10.5, 10.5]],
    silkscreen: [
      { x1: -9.6, y1: -10.0, x2: 9.6, y2: -10.0 },
      { x1: -9.6, y1:  10.0, x2: 9.6, y2:  10.0 },
    ],
    body3d: { width: 18.0, height: 20.0, depth: 3.1, offsetZ: 0 },
  },

  // ── BME280 LGA-8 ──────────────────────────────────────────────────────────
  BME280_LGA8: {
    id: 'BME280_LGA8',
    name: 'Bosch_LGA-8_2.5x2.5mm_P0.65mm',
    pads: [
      smd(1, -0.975, -0.65, 0.7, 0.9),
      smd(2, -0.975,  0.0,  0.7, 0.9),
      smd(3, -0.975,  0.65, 0.7, 0.9),
      smd(4,  0.0,    1.0,  0.9, 0.7),
      smd(5,  0.975,  0.65, 0.7, 0.9),
      smd(6,  0.975,  0.0,  0.7, 0.9),
      smd(7,  0.975, -0.65, 0.7, 0.9),
      smd(8,  0.0,   -1.0,  0.9, 0.7),
    ],
    courtyard: [[-1.65, -1.65], [1.65, -1.65], [1.65, 1.65], [-1.65, 1.65]],
    silkscreen: [],
    body3d: { width: 2.5, height: 2.5, depth: 0.93, offsetZ: 0 },
  },
};
