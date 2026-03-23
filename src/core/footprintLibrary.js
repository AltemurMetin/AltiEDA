/**
 * AltiEDA – PCB Footprint Library
 * Maps footprint IDs to physical pad/courtyard data (all units in mm).
 *
 * Dimensions sourced from manufacturer datasheets and IPC-7351B standard.
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
  // ── 0805 SMD Packages (IPC-7351B nominal) ──────────────────────────────────
  // Body: 2.0 x 1.25 mm, pad-to-pad span 2.2 mm (center-center)
  R_0805: {
    id: 'R_0805',
    name: 'Resistor_SMD:R_0805',
    pads: [smd(1, -0.95, 0, 1.3, 1.5), smd(2, 0.95, 0, 1.3, 1.5)],
    courtyard: [[-1.9, -1.1], [1.9, -1.1], [1.9, 1.1], [-1.9, 1.1]],
    silkscreen: [{ x1: -0.3, y1: -0.9, x2: 0.3, y2: -0.9 }, { x1: -0.3, y1: 0.9, x2: 0.3, y2: 0.9 }],
    body3d: { width: 2.0, height: 1.25, depth: 0.5, offsetZ: 0, color: 0x1a1a1a },
  },

  C_0805: {
    id: 'C_0805',
    name: 'Capacitor_SMD:C_0805',
    pads: [smd(1, -0.95, 0, 1.3, 1.5), smd(2, 0.95, 0, 1.3, 1.5)],
    courtyard: [[-1.9, -1.1], [1.9, -1.1], [1.9, 1.1], [-1.9, 1.1]],
    silkscreen: [{ x1: -0.3, y1: -0.9, x2: 0.3, y2: -0.9 }, { x1: -0.3, y1: 0.9, x2: 0.3, y2: 0.9 }],
    body3d: { width: 2.0, height: 1.25, depth: 1.25, offsetZ: 0, color: 0xc8a86e },
  },

  L_0805: {
    id: 'L_0805',
    name: 'Inductor_SMD:L_0805',
    pads: [smd(1, -0.95, 0, 1.3, 1.5), smd(2, 0.95, 0, 1.3, 1.5)],
    courtyard: [[-1.9, -1.1], [1.9, -1.1], [1.9, 1.1], [-1.9, 1.1]],
    silkscreen: [{ x1: -0.3, y1: -0.9, x2: 0.3, y2: -0.9 }, { x1: -0.3, y1: 0.9, x2: 0.3, y2: 0.9 }],
    body3d: { width: 2.0, height: 1.25, depth: 0.85, offsetZ: 0, color: 0x2d2d2d },
  },

  LED_0805: {
    id: 'LED_0805',
    name: 'LED_SMD:LED_0805',
    pads: [smd(1, -0.95, 0, 1.3, 1.5), smd(2, 0.95, 0, 1.3, 1.5)],
    courtyard: [[-1.9, -1.1], [1.9, -1.1], [1.9, 1.1], [-1.9, 1.1]],
    silkscreen: [],
    body3d: { width: 2.0, height: 1.25, depth: 0.8, offsetZ: 0, color: 0xff2020, emissive: 0x660000 },
  },

  // ── Diode Packages ─────────────────────────────────────────────────────────
  // DO-41: body 5.2 x 2.7 mm dia, lead span 25.4 mm (use 10.16 mm for compact)
  D_DO41: {
    id: 'D_DO41',
    name: 'Diode_THT:D_DO-41',
    pads: [th(1, -5.08, 0, 0.9, 1.6), th(2, 5.08, 0, 0.9, 1.6)],
    courtyard: [[-6.1, -1.6], [6.1, -1.6], [6.1, 1.6], [-6.1, 1.6]],
    silkscreen: [{ x1: -2.6, y1: -1.3, x2: 2.6, y2: -1.3 }, { x1: -2.6, y1: 1.3, x2: 2.6, y2: 1.3 },
                 { x1: -2.6, y1: -1.3, x2: -2.6, y2: 1.3 }, { x1: 2.6, y1: -1.3, x2: 2.6, y2: 1.3 },
                 { x1: 1.8, y1: -1.3, x2: 1.8, y2: 1.3 }],
    body3d: { width: 5.2, height: 2.7, depth: 2.7, offsetZ: 0, color: 0x1a1a1a },
  },

  // DO-35: body 3.4 x 1.8 mm dia, lead span 7.62 mm
  D_DO35: {
    id: 'D_DO35',
    name: 'Diode_THT:D_DO-35',
    pads: [th(1, -3.81, 0, 0.7, 1.3), th(2, 3.81, 0, 0.7, 1.3)],
    courtyard: [[-4.7, -1.2], [4.7, -1.2], [4.7, 1.2], [-4.7, 1.2]],
    silkscreen: [{ x1: -1.7, y1: -0.9, x2: 1.7, y2: -0.9 }, { x1: -1.7, y1: 0.9, x2: 1.7, y2: 0.9 },
                 { x1: -1.7, y1: -0.9, x2: -1.7, y2: 0.9 }, { x1: 1.7, y1: -0.9, x2: 1.7, y2: 0.9 }],
    body3d: { width: 3.4, height: 1.8, depth: 1.8, offsetZ: 0, color: 0xcc4400 },
  },

  // ── TO-92 (JEDEC) ────────────────────────────────────────────────────────
  // Body: 4.19 x 3.81 x 4.83 mm (w x d x h), pin pitch 1.27 mm
  TO92: {
    id: 'TO92',
    name: 'Package_TO_SOT_THT:TO-92',
    pads: [th(1, -1.27, 0, 0.75, 1.3), th(2, 0, 0, 0.75, 1.3), th(3, 1.27, 0, 0.75, 1.3)],
    courtyard: [[-2.7, -1.8], [2.7, -1.8], [2.7, 2.7], [-2.7, 2.7]],
    silkscreen: [{ x1: -2.1, y1: -1.5, x2: 2.1, y2: -1.5 }],
    body3d: { width: 4.19, height: 3.81, depth: 4.83, offsetZ: 0, color: 0x1a1a1a },
  },

  // ── TO-220-3 (JEDEC) ─────────────────────────────────────────────────────
  // Body: 10.16 x 4.83 mm, height 15.75 mm (with tab), pin pitch 2.54 mm
  'TO220-3': {
    id: 'TO220-3',
    name: 'Package_TO_SOT_THT:TO-220-3',
    pads: [th(1, -2.54, 0, 1.05, 2.0), th(2, 0, 0, 1.05, 2.0), th(3, 2.54, 0, 1.05, 2.0)],
    courtyard: [[-5.5, -3.5], [5.5, -3.5], [5.5, 5.5], [-5.5, 5.5]],
    silkscreen: [{ x1: -5.08, y1: -3.3, x2: 5.08, y2: -3.3 }, { x1: -5.08, y1: 3.3, x2: 5.08, y2: 3.3 },
                 { x1: -5.08, y1: -3.3, x2: -5.08, y2: 3.3 }, { x1: 5.08, y1: -3.3, x2: 5.08, y2: 3.3 }],
    body3d: { width: 10.16, height: 4.83, depth: 15.75, offsetZ: 0, color: 0x1a1a1a, tabColor: 0xcccccc },
  },

  // ── SOT-223 (JEDEC TO-261) ────────────────────────────────────────────────
  // Body: 6.5 x 3.5 mm, height 1.8 mm; 3 small pads + 1 large tab (AMS1117 datasheet)
  SOT223: {
    id: 'SOT223',
    name: 'Package_TO_SOT_SMD:SOT-223',
    pads: [smd(1, -2.3, -3.15, 1.0, 2.0), smd(2, 0, -3.15, 1.0, 2.0),
           smd(3, 2.3, -3.15, 1.0, 2.0), smd(4, 0, 3.15, 3.2, 2.0)],
    courtyard: [[-3.7, -4.4], [3.7, -4.4], [3.7, 4.4], [-3.7, 4.4]],
    silkscreen: [{ x1: -3.3, y1: -1.6, x2: 3.3, y2: -1.6 }, { x1: -3.3, y1: 1.6, x2: 3.3, y2: 1.6 },
                 { x1: -3.3, y1: -1.6, x2: -3.3, y2: 1.6 }, { x1: 3.3, y1: -1.6, x2: 3.3, y2: 1.6 }],
    body3d: { width: 6.5, height: 3.5, depth: 1.8, offsetZ: 0, color: 0x1a1a1a },
  },

  // ── 6x6 mm Tactile Switch (Omron B3F series) ─────────────────────────────
  // Body: 6.0 x 6.0 mm, height 4.3 mm, pin spacing 6.5 x 4.5 mm
  SW_TACT_6mm: {
    id: 'SW_TACT_6mm',
    name: 'Button_Switch_THT:SW_TACT_6mm',
    pads: [th(1, -3.25, -2.25, 1.0, 1.6), th(2, -3.25, 2.25, 1.0, 1.6),
           th(3, 3.25, -2.25, 1.0, 1.6), th(4, 3.25, 2.25, 1.0, 1.6)],
    courtyard: [[-4.1, -3.1], [4.1, -3.1], [4.1, 3.1], [-4.1, 3.1]],
    silkscreen: [{ x1: -3.0, y1: -3.0, x2: 3.0, y2: -3.0 }, { x1: -3.0, y1: 3.0, x2: 3.0, y2: 3.0 },
                 { x1: -3.0, y1: -3.0, x2: -3.0, y2: 3.0 }, { x1: 3.0, y1: -3.0, x2: 3.0, y2: 3.0 }],
    body3d: { width: 6.0, height: 6.0, depth: 4.3, offsetZ: 0, color: 0x2b2b2b, capColor: 0xffcc00 },
  },

  // ── HC-49/S Crystal ───────────────────────────────────────────────────────
  // Body: 11.5 x 4.5 mm (HC-49/S), height 3.5 mm, pin pitch 4.88 mm
  Crystal_HC49: {
    id: 'Crystal_HC49',
    name: 'Crystal_THT:Crystal_HC49',
    pads: [th(1, -2.44, 0, 0.7, 1.4), th(2, 2.44, 0, 0.7, 1.4)],
    courtyard: [[-5.8, -2.1], [5.8, -2.1], [5.8, 2.1], [-5.8, 2.1]],
    silkscreen: [{ x1: -5.5, y1: -1.8, x2: 5.5, y2: -1.8 }, { x1: -5.5, y1: 1.8, x2: 5.5, y2: 1.8 },
                 { x1: -5.5, y1: -1.8, x2: -5.5, y2: 1.8 }, { x1: 5.5, y1: -1.8, x2: 5.5, y2: 1.8 }],
    body3d: { width: 11.5, height: 4.5, depth: 3.5, offsetZ: 0, color: 0xd0d0d0, metalness: 0.9 },
  },

  // ── 12mm Piezo Buzzer ─────────────────────────────────────────────────────
  // Body: 12.0 mm dia, height 9.5 mm, pin pitch 6.5 mm
  Buzzer_12mm: {
    id: 'Buzzer_12mm',
    name: 'Buzzer:Buzzer_12mm',
    pads: [th(1, -3.25, 0, 1.0, 1.6), th(2, 3.25, 0, 1.0, 1.6)],
    courtyard: [[-7.0, -7.0], [7.0, -7.0], [7.0, 7.0], [-7.0, 7.0]],
    silkscreen: [],
    body3d: { width: 12.0, height: 12.0, depth: 9.5, offsetZ: 0, color: 0x1a1a1a, shape: 'cylinder' },
  },

  // ── Pin Header Connectors (2.54mm pitch) ──────────────────────────────────
  // Standard: body 2.54 x N*2.54 mm, pin: 0.64 sq, drill 1.0 mm
  Connector_2pin_2_54mm: {
    id: 'Connector_2pin_2.54mm',
    name: 'Connector_PinHeader_1x02_P2.54mm',
    pads: [th(1, 0, -1.27, 1.0, 1.7), th(2, 0, 1.27, 1.0, 1.7)],
    courtyard: [[-1.8, -2.8], [1.8, -2.8], [1.8, 2.8], [-1.8, 2.8]],
    silkscreen: [{ x1: -1.3, y1: -2.3, x2: 1.3, y2: -2.3 }, { x1: -1.3, y1: 2.3, x2: 1.3, y2: 2.3 },
                 { x1: -1.3, y1: -2.3, x2: -1.3, y2: 2.3 }, { x1: 1.3, y1: -2.3, x2: 1.3, y2: 2.3 }],
    body3d: { width: 2.54, height: 5.08, depth: 8.5, offsetZ: 0, color: 0x1a1a1a, pinColor: 0xd4af37 },
  },

  Connector_3pin_2_54mm: {
    id: 'Connector_3pin_2.54mm',
    name: 'Connector_PinHeader_1x03_P2.54mm',
    pads: [th(1, 0, -2.54, 1.0, 1.7), th(2, 0, 0, 1.0, 1.7), th(3, 0, 2.54, 1.0, 1.7)],
    courtyard: [[-1.8, -4.1], [1.8, -4.1], [1.8, 4.1], [-1.8, 4.1]],
    silkscreen: [{ x1: -1.3, y1: -3.6, x2: 1.3, y2: -3.6 }, { x1: -1.3, y1: 3.6, x2: 1.3, y2: 3.6 },
                 { x1: -1.3, y1: -3.6, x2: -1.3, y2: 3.6 }, { x1: 1.3, y1: -3.6, x2: 1.3, y2: 3.6 }],
    body3d: { width: 2.54, height: 7.62, depth: 8.5, offsetZ: 0, color: 0x1a1a1a, pinColor: 0xd4af37 },
  },

  Connector_4pin_2_54mm: {
    id: 'Connector_4pin_2.54mm',
    name: 'Connector_PinHeader_1x04_P2.54mm',
    pads: [th(1, 0, -3.81, 1.0, 1.7), th(2, 0, -1.27, 1.0, 1.7),
           th(3, 0, 1.27, 1.0, 1.7), th(4, 0, 3.81, 1.0, 1.7)],
    courtyard: [[-1.8, -5.3], [1.8, -5.3], [1.8, 5.3], [-1.8, 5.3]],
    silkscreen: [{ x1: -1.3, y1: -4.8, x2: 1.3, y2: -4.8 }, { x1: -1.3, y1: 4.8, x2: 1.3, y2: 4.8 },
                 { x1: -1.3, y1: -4.8, x2: -1.3, y2: 4.8 }, { x1: 1.3, y1: -4.8, x2: 1.3, y2: 4.8 }],
    body3d: { width: 2.54, height: 10.16, depth: 8.5, offsetZ: 0, color: 0x1a1a1a, pinColor: 0xd4af37 },
  },

  // ── USB Micro-B (Molex 1050170001 style) ──────────────────────────────────
  // Body: 7.8 x 6.35 mm, height 2.94 mm (Molex 47346-0001)
  USB_Micro_B: {
    id: 'USB_Micro_B',
    name: 'Connector_USB:USB_Micro-B',
    pads: [smd(1, -1.3, -3.35, 0.4, 1.35), smd(2, -0.65, -3.35, 0.4, 1.35),
           smd(3, 0, -3.35, 0.4, 1.35), smd(4, 0.65, -3.35, 0.4, 1.35),
           smd(5, 1.3, -3.35, 0.4, 1.35)],
    courtyard: [[-4.0, -4.2], [4.0, -4.2], [4.0, 1.5], [-4.0, 1.5]],
    silkscreen: [{ x1: -3.8, y1: -3.8, x2: 3.8, y2: -3.8 }, { x1: -3.8, y1: 1.2, x2: 3.8, y2: 1.2 },
                 { x1: -3.8, y1: -3.8, x2: -3.8, y2: 1.2 }, { x1: 3.8, y1: -3.8, x2: 3.8, y2: 1.2 }],
    body3d: { width: 7.8, height: 6.35, depth: 2.94, offsetZ: 0, color: 0xc0c0c0, metalness: 0.8 },
  },

  // ── Through-hole axial resistor (5mm body) ────────────────────────────────
  // Body: 3.2 x 1.8 mm dia, lead span 5.08 mm (0.2")
  R_TH_5mm: {
    id: 'R_TH_5mm',
    name: 'Resistor_THT:R_Axial_5mm',
    pads: [th(1, -2.54, 0, 0.7, 1.3), th(2, 2.54, 0, 0.7, 1.3)],
    courtyard: [[-3.5, -1.2], [3.5, -1.2], [3.5, 1.2], [-3.5, 1.2]],
    silkscreen: [{ x1: -1.6, y1: -0.9, x2: 1.6, y2: -0.9 }, { x1: -1.6, y1: 0.9, x2: 1.6, y2: 0.9 },
                 { x1: -1.6, y1: -0.9, x2: -1.6, y2: 0.9 }, { x1: 1.6, y1: -0.9, x2: 1.6, y2: 0.9 }],
    body3d: { width: 3.2, height: 1.8, depth: 1.8, offsetZ: 0, color: 0xd2b48c },
  },

  // ── DIP Packages (JEDEC MS-001) ───────────────────────────────────────────
  // DIP-8: body 9.27 x 6.35 mm, height 3.3 mm, pin pitch 2.54 mm, row spacing 7.62 mm
  DIP8: {
    id: 'DIP8',
    name: 'Package_DIP:DIP-8',
    pads: [...dipRow(1, 4, -3.81, -3.81, 2.54), ...dipRow(5, 4, 3.81, 3.81, -2.54)],
    courtyard: [[-5.3, -5.3], [5.3, -5.3], [5.3, 5.3], [-5.3, 5.3]],
    silkscreen: [{ x1: -4.8, y1: -4.8, x2: 4.8, y2: -4.8 }, { x1: -4.8, y1: 4.8, x2: 4.8, y2: 4.8 },
                 { x1: -4.8, y1: -4.8, x2: -4.8, y2: 4.8 }, { x1: 4.8, y1: -4.8, x2: 4.8, y2: 4.8 }],
    body3d: { width: 9.27, height: 6.35, depth: 3.3, offsetZ: 0, color: 0x1a1a1a },
  },

  // DIP-16: body 19.05 x 6.35 mm, height 3.3 mm
  DIP16: {
    id: 'DIP16',
    name: 'Package_DIP:DIP-16',
    pads: [...dipRow(1, 8, -3.81, -8.89, 2.54), ...dipRow(9, 8, 3.81, 8.89, -2.54)],
    courtyard: [[-5.3, -10.3], [5.3, -10.3], [5.3, 10.3], [-5.3, 10.3]],
    silkscreen: [{ x1: -4.8, y1: -9.8, x2: 4.8, y2: -9.8 }, { x1: -4.8, y1: 9.8, x2: 4.8, y2: 9.8 },
                 { x1: -4.8, y1: -9.8, x2: -4.8, y2: 9.8 }, { x1: 4.8, y1: -9.8, x2: 4.8, y2: 9.8 }],
    body3d: { width: 19.05, height: 6.35, depth: 3.3, offsetZ: 0, color: 0x1a1a1a },
  },

  // DIP-28: body 34.93 x 6.35 mm, height 3.3 mm
  DIP28: {
    id: 'DIP28',
    name: 'Package_DIP:DIP-28',
    pads: [...dipRow(1, 14, -3.81, -16.51, 2.54), ...dipRow(15, 14, 3.81, 16.51, -2.54)],
    courtyard: [[-5.3, -18.0], [5.3, -18.0], [5.3, 18.0], [-5.3, 18.0]],
    silkscreen: [{ x1: -4.8, y1: -17.5, x2: 4.8, y2: -17.5 }, { x1: -4.8, y1: 17.5, x2: 4.8, y2: 17.5 },
                 { x1: -4.8, y1: -17.5, x2: -4.8, y2: 17.5 }, { x1: 4.8, y1: -17.5, x2: 4.8, y2: 17.5 }],
    body3d: { width: 34.93, height: 6.35, depth: 3.3, offsetZ: 0, color: 0x1a1a1a },
  },

  // ── ESP32-WROOM-32 Module ─────────────────────────────────────────────────
  // Body: 18.0 x 25.5 x 3.1 mm (per Espressif datasheet)
  ESP32_WROOM_32: {
    id: 'ESP32_WROOM_32',
    name: 'RF_Module:ESP32-WROOM-32',
    pads: [
      ...Array.from({ length: 14 }, (_, i) => smd(i + 1, -8.5, -8.89 + i * 1.27, 2.0, 0.9)),
      ...Array.from({ length: 14 }, (_, i) => smd(i + 15, 8.5, 8.89 - i * 1.27, 2.0, 0.9)),
      smd(29, -3.5, 10.0, 1.5, 1.5), smd(30, -1.0, 10.0, 1.5, 1.5),
      smd(31, 1.0, 10.0, 1.5, 1.5), smd(32, 3.5, 10.0, 1.5, 1.5),
      smd(33, 0, 11.5, 6.7, 2.0),
      smd(38, 0, -12.0, 6.0, 2.0),
    ],
    courtyard: [[-10.0, -13.5], [10.0, -13.5], [10.0, 13.5], [-10.0, 13.5]],
    silkscreen: [{ x1: -9.0, y1: -12.75, x2: 9.0, y2: -12.75 }, { x1: -9.0, y1: 12.75, x2: 9.0, y2: 12.75 }],
    body3d: { width: 18.0, height: 25.5, depth: 3.1, offsetZ: 0, color: 0x1a1a1a, shieldColor: 0xc0c0c0 },
  },

  // ── BME280 LGA-8 (Bosch) ──────────────────────────────────────────────────
  // Body: 2.5 x 2.5 x 0.93 mm (per Bosch datasheet)
  BME280_LGA8: {
    id: 'BME280_LGA8',
    name: 'Bosch_LGA-8',
    pads: [
      smd(1, -0.675, -0.5, 0.45, 0.45), smd(2, -0.675, 0, 0.45, 0.45),
      smd(3, -0.675, 0.5, 0.45, 0.45), smd(4, 0, 0.875, 0.45, 0.45),
      smd(5, 0.675, 0.5, 0.45, 0.45), smd(6, 0.675, 0, 0.45, 0.45),
      smd(7, 0.675, -0.5, 0.45, 0.45), smd(8, 0, -0.875, 0.45, 0.45),
    ],
    courtyard: [[-1.55, -1.55], [1.55, -1.55], [1.55, 1.55], [-1.55, 1.55]],
    silkscreen: [],
    body3d: { width: 2.5, height: 2.5, depth: 0.93, offsetZ: 0, color: 0xc0c0c0, metalness: 0.6 },
  },

  // ── Sensor/Display modules ────────────────────────────────────────────────
  // DHT22 (AM2302): body 25.1 x 15.1 x 7.7 mm, 4 pins at 2.54 mm pitch
  DHT22:         _moduleFootprint('DHT22', 4, 2.54, { width: 25.1, height: 15.1, depth: 7.7, color: 0xf0f0f0 }),
  // HC-SR04: body 45.0 x 20.0 x 15.0 mm, 4 pins at 2.54 mm pitch
  HC_SR04:       _moduleFootprint('HC_SR04', 4, 2.54, { width: 45.0, height: 20.0, depth: 15.0, color: 0x0066cc }),
  // HC-SR501: body 32.0 x 24.0 x 18.0 mm (dome), 3 pins at 2.54 mm pitch
  HC_SR501:      _moduleFootprint('HC_SR501', 3, 2.54, { width: 32.0, height: 24.0, depth: 18.0, color: 0x228b22 }),
  // MPU-6050 QFN-24: IC body 4.0 x 4.0 x 0.9 mm (InvenSense datasheet)
  QFN24:         _moduleFootprint('QFN24', 6, 2.0, { width: 4.0, height: 4.0, depth: 0.9, color: 0x1a1a1a }),
  // SSD1306 0.96" OLED module: 27.3 x 27.8 x 4.3 mm, 4-pin I2C
  OLED_0_96in:   _moduleFootprint('OLED_0.96in', 4, 2.54, { width: 27.3, height: 27.8, depth: 4.3, color: 0x000010, screenColor: 0x0040ff }),
  // LCD 16x2: 80.0 x 36.0 x 12.0 mm, 16 pins at 2.54 mm pitch
  LCD_16x2:      _moduleFootprint('LCD_16x2', 16, 2.54, { width: 80.0, height: 36.0, depth: 12.0, color: 0x006633, screenColor: 0x88cc44 }),

  // ── Arduino / RPi / Module footprints ─────────────────────────────────────
  // Arduino Uno R3: 68.6 x 53.4 x 14.5 mm board
  Arduino_UNO_R3:   _moduleFootprint('Arduino_UNO_R3', 28, 2.54, { width: 68.6, height: 53.4, depth: 14.5, color: 0x007eb5 }),
  // Arduino Nano: 45.0 x 18.0 x 8.0 mm board (per Arduino datasheet A000005)
  Arduino_Nano:     _moduleFootprint('Arduino_Nano', 30, 2.54, { width: 45.0, height: 18.0, depth: 8.0, color: 0x007eb5 }),
  // Arduino Mega 2560 R3: 101.6 x 53.34 x 15.0 mm board (per Arduino store specs)
  Arduino_MEGA2560_R3: _moduleFootprint('Arduino_MEGA2560_R3', 36, 2.54, { width: 101.6, height: 53.34, depth: 15.0, color: 0x007eb5 }),
  // ESP8266 ESP-12F module: 24.0 x 16.0 x 3.0 mm
  'ESP8266-12F':    _moduleFootprint('ESP8266-12F', 16, 2.0, { width: 24.0, height: 16.0, depth: 3.0, color: 0x1a1a1a, shieldColor: 0xc0c0c0 }),
  // STM32F103 LQFP-48: 7.0 x 7.0 x 1.4 mm (package body)
  LQFP48:           _moduleFootprint('LQFP48', 36, 1.0, { width: 7.0, height: 7.0, depth: 1.4, color: 0x1a1a1a }),
  // Raspberry Pi Pico: 51.0 x 21.0 x 3.9 mm board
  RPi_Pico:         _moduleFootprint('RPi_Pico', 40, 2.54, { width: 51.0, height: 21.0, depth: 3.9, color: 0x228b22 }),

};

// ── Aliases: map dotted footprintIds to their underscore entries ─────────────
FOOTPRINT_MAP['Connector_2pin_2.54mm'] = FOOTPRINT_MAP.Connector_2pin_2_54mm;
FOOTPRINT_MAP['Connector_3pin_2.54mm'] = FOOTPRINT_MAP.Connector_3pin_2_54mm;
FOOTPRINT_MAP['Connector_4pin_2.54mm'] = FOOTPRINT_MAP.Connector_4pin_2_54mm;
FOOTPRINT_MAP['OLED_0.96in']          = FOOTPRINT_MAP.OLED_0_96in;

/** Generate a generic module footprint with N pins in dual rows */
function _moduleFootprint(id, pinCount, pitch, body3dOverride = null) {
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
  const defaultBody = { width: hW * 2, height: hH * 2, depth: 3.0, offsetZ: 0, color: 0x1a1a2e };
  return {
    id,
    name: `Module:${id}`,
    pads,
    courtyard: [[-hW, -hH], [hW, -hH], [hW, hH], [-hW, hH]],
    silkscreen: [{ x1: -hW + 0.5, y1: -hH + 0.5, x2: hW - 0.5, y2: -hH + 0.5 },
                 { x1: -hW + 0.5, y1: hH - 0.5, x2: hW - 0.5, y2: hH - 0.5 },
                 { x1: -hW + 0.5, y1: -hH + 0.5, x2: -hW + 0.5, y2: hH - 0.5 },
                 { x1: hW - 0.5, y1: -hH + 0.5, x2: hW - 0.5, y2: hH - 0.5 }],
    body3d: body3dOverride
      ? { ...defaultBody, ...body3dOverride, offsetZ: body3dOverride.offsetZ ?? 0 }
      : defaultBody,
  };
}
