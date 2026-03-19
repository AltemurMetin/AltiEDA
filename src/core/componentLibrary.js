/**
 * AltiEDA – Built-in Component Library
 * Each entry includes schematic pins, footprint ID, SPICE model, and 3D body info.
 */
import { PinType, createPin } from './dataModels.js';

const P = (num, name, type, ox, oy) => createPin(num, name, type, ox, oy);

export const COMPONENT_LIBRARY = [
  // ── Passives ──────────────────────────────────────────────────────────────
  {
    partId:       'R_GENERIC',
    partName:     'Resistor',
    category:     'Passive',
    defaultValue: '10k',
    footprintId:  'R_0805',
    spiceModel:   { type: 'R', directive: null },
    pins: [
      P(1, 'P1', PinType.PASSIVE, -20, 0),
      P(2, 'P2', PinType.PASSIVE,  20, 0),
    ],
  },
  {
    partId:       'C_GENERIC',
    partName:     'Capacitor',
    category:     'Passive',
    defaultValue: '100nF',
    footprintId:  'C_0805',
    spiceModel:   { type: 'C', directive: null },
    pins: [
      P(1, 'P1', PinType.PASSIVE, -20, 0),
      P(2, 'P2', PinType.PASSIVE,  20, 0),
    ],
  },
  {
    partId:       'LED_GENERIC',
    partName:     'LED',
    category:     'Passive',
    defaultValue: 'RED',
    footprintId:  'LED_0805',
    spiceModel:   { type: 'D', directive: '.model DLED D(Is=1e-10 N=2 RS=1)' },
    pins: [
      P(1, 'A',  PinType.PASSIVE, -20, 0),
      P(2, 'K',  PinType.PASSIVE,  20, 0),
    ],
  },

  // ── Power symbols ─────────────────────────────────────────────────────────
  {
    partId:   'PWR_VCC',
    partName: '+VCC',
    category: 'Power',
    defaultValue: '+3.3V',
    footprintId: null,
    spiceModel:  { type: 'V', directive: 'DC 3.3' },
    pins: [
      P(1, 'VCC', PinType.POWER_OUT, 0, 20),
    ],
  },
  {
    partId:   'PWR_GND',
    partName: 'GND',
    category: 'Power',
    defaultValue: '0V',
    footprintId: null,
    spiceModel:  { type: 'V', directive: 'DC 0' },
    pins: [
      P(1, 'GND', PinType.POWER_IN, 0, -20),
    ],
  },

  // ── Microcontrollers ──────────────────────────────────────────────────────
  {
    partId:       'ESP32_WROOM',
    partName:     'ESP32-WROOM',
    category:     'MCU',
    defaultValue: '',
    footprintId:  'ESP32_WROOM_32',
    spiceModel:   null,
    pins: [
      P(1,  'GND',      PinType.POWER_IN,   -40, -60),
      P(2,  '3V3',      PinType.POWER_IN,   -40, -50),
      P(3,  'EN',       PinType.INPUT,      -40, -40),
      P(4,  'GPIO36',   PinType.INPUT,      -40, -30),
      P(5,  'GPIO39',   PinType.INPUT,      -40, -20),
      P(6,  'GPIO34',   PinType.INPUT,      -40, -10),
      P(7,  'GPIO35',   PinType.INPUT,      -40,  0),
      P(8,  'GPIO32',   PinType.BIDIRECTIONAL, -40, 10),
      P(9,  'GPIO33',   PinType.BIDIRECTIONAL, -40, 20),
      P(10, 'GPIO25',   PinType.BIDIRECTIONAL, -40, 30),
      P(11, 'GPIO26',   PinType.BIDIRECTIONAL, -40, 40),
      P(12, 'GPIO27',   PinType.BIDIRECTIONAL, -40, 50),
      P(13, 'GPIO14_PWM', PinType.OUTPUT,   -40, 60),
      P(14, 'GPIO12',   PinType.BIDIRECTIONAL,  40, 60),
      P(15, 'GPIO13',   PinType.BIDIRECTIONAL,  40, 50),
      P(16, 'GPIO15',   PinType.BIDIRECTIONAL,  40, 40),
      P(17, 'GPIO2',    PinType.BIDIRECTIONAL,  40, 30),
      P(18, 'GPIO0',    PinType.BIDIRECTIONAL,  40, 20),
      P(19, 'GPIO4',    PinType.BIDIRECTIONAL,  40, 10),
      P(20, 'GPIO16_TX', PinType.OUTPUT,        40,  0),   // UART TX
      P(21, 'GPIO17_RX', PinType.INPUT,         40, -10),  // UART RX
      P(22, 'GPIO5_SS',  PinType.OUTPUT,        40, -20),  // SPI SS
      P(23, 'GPIO18_SCK',PinType.OUTPUT,        40, -30),  // SPI SCK
      P(24, 'GPIO19_MISO',PinType.INPUT,        40, -40),  // SPI MISO
      P(25, 'GPIO21_SDA',PinType.BIDIRECTIONAL, 40, -50),  // I2C SDA
      P(26, 'GPIO22_SCL',PinType.OUTPUT,        40, -60),  // I2C SCL
      P(27, 'GPIO23_MOSI',PinType.OUTPUT,       0,  70),   // SPI MOSI
      P(38, 'GND2',     PinType.POWER_IN,       0, -70),
    ],
  },

  // ── I2C Sensors ───────────────────────────────────────────────────────────
  {
    partId:       'BME280',
    partName:     'BME280',
    category:     'Sensor',
    defaultValue: 'Temp/Humidity/Pressure',
    footprintId:  'BME280_LGA8',
    spiceModel:   null,
    pins: [
      P(1, 'VCC',  PinType.POWER_IN,    -30, -20),
      P(2, 'GND',  PinType.POWER_IN,    -30,  20),
      P(3, 'SDI',  PinType.BIDIRECTIONAL, 30, -20),  // I2C SDA / SPI MOSI
      P(4, 'SCK',  PinType.INPUT,         30,  0),   // I2C SCL / SPI CLK
      P(5, 'SDO',  PinType.OUTPUT,        30, 20),   // I2C addr / SPI MISO
      P(6, 'CSB',  PinType.INPUT,         0, -30),   // SPI CS
      P(7, 'VDDIO',PinType.POWER_IN,     -30,  0),
    ],
  },

  // ── Voltage regulator ─────────────────────────────────────────────────────
  {
    partId:       'AMS1117_3V3',
    partName:     'AMS1117-3.3',
    category:     'PowerMgmt',
    defaultValue: '3.3V LDO',
    footprintId:  'SOT223',
    spiceModel:   { type: 'X', directive: '.subckt AMS1117 IN GND OUT' },
    pins: [
      P(1, 'GND', PinType.POWER_IN,   -30, 0),
      P(2, 'OUT', PinType.POWER_OUT,   30, 0),
      P(3, 'IN',  PinType.POWER_IN,    0, -30),
      P(4, 'OUT2',PinType.POWER_OUT,   0,  30),
    ],
  },
];

// Index by partId for fast lookup
export const LIBRARY_MAP = Object.fromEntries(
  COMPONENT_LIBRARY.map(c => [c.partId, c])
);
