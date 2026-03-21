/**
 * AltiEDA – Built-in Component Library
 * Each entry includes schematic pins, footprint ID, SPICE model.
 */
import { PinType, createPin } from './dataModels.js';

const P = (num, name, type, ox, oy) => createPin(num, name, type, ox, oy);

/** Helpers for evenly-spaced pin rows */
function rowL(startNum, names, types = []) {
  const n = names.length, sp = 14, half = (n - 1) * sp / 2;
  return names.map((name, i) =>
    P(startNum + i, name, types[i] ?? PinType.PASSIVE, -55, Math.round(i * sp - half)));
}
function rowR(startNum, names, types = []) {
  const n = names.length, sp = 14, half = (n - 1) * sp / 2;
  return names.map((name, i) =>
    P(startNum + i, name, types[i] ?? PinType.PASSIVE, 55, Math.round(i * sp - half)));
}

export const COMPONENT_LIBRARY = [

  // ── Passives ────────────────────────────────────────────────────────────────
  {
    partId:       'R_GENERIC',
    partName:     'Resistor',
    category:     'Passive',
    defaultValue: '10k',
    footprintId:  'R_0805',
    spiceModel:   { type: 'R', directive: null },
    pins: [
      P(1, 'P1', PinType.PASSIVE, -30, 0),
      P(2, 'P2', PinType.PASSIVE,  30, 0),
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
    partId:       'L_GENERIC',
    partName:     'Inductor',
    category:     'Passive',
    defaultValue: '10uH',
    footprintId:  'L_0805',
    spiceModel:   { type: 'L', directive: null },
    pins: [
      P(1, 'P1', PinType.PASSIVE, -30, 0),
      P(2, 'P2', PinType.PASSIVE,  30, 0),
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
      P(1, 'A',  PinType.PASSIVE, -24, 0),
      P(2, 'K',  PinType.PASSIVE,  24, 0),
    ],
  },
  {
    partId:       'D_1N4007',
    partName:     '1N4007',
    category:     'Passive',
    defaultValue: '1A/1kV',
    footprintId:  'D_DO41',
    spiceModel:   { type: 'D', directive: '.model D1N4007 D(Is=76.9n N=1.45 Rs=42m)' },
    pins: [
      P(1, 'A', PinType.PASSIVE, -24, 0),
      P(2, 'K', PinType.PASSIVE,  24, 0),
    ],
  },
  {
    partId:       'D_ZENER',
    partName:     'Zener',
    category:     'Passive',
    defaultValue: '5.1V',
    footprintId:  'D_DO35',
    spiceModel:   { type: 'D', directive: '.model DZENER D(Is=1e-10 BV=5.1)' },
    pins: [
      P(1, 'A', PinType.PASSIVE, -24, 0),
      P(2, 'K', PinType.PASSIVE,  24, 0),
    ],
  },
  {
    partId:       'D_SCHOTTKY',
    partName:     'Schottky',
    category:     'Passive',
    defaultValue: '1N5819',
    footprintId:  'D_DO41',
    spiceModel:   { type: 'D', directive: '.model D1N5819 D(Is=2.8u N=1.03 Rs=0.03)' },
    pins: [
      P(1, 'A', PinType.PASSIVE, -24, 0),
      P(2, 'K', PinType.PASSIVE,  24, 0),
    ],
  },
  {
    partId:       'Q_NPN_BC547',
    partName:     'NPN-BC547',
    category:     'Passive',
    defaultValue: 'BC547',
    footprintId:  'TO92',
    spiceModel:   { type: 'Q', directive: '.model BC547 NPN(BF=400 IS=1e-14 VAF=100)' },
    pins: [
      P(1, 'B', PinType.PASSIVE, -20, 0),
      P(2, 'C', PinType.PASSIVE,  12, -18),
      P(3, 'E', PinType.PASSIVE,  12,  18),
    ],
  },
  {
    partId:       'Q_PNP_BC557',
    partName:     'PNP-BC557',
    category:     'Passive',
    defaultValue: 'BC557',
    footprintId:  'TO92',
    spiceModel:   { type: 'Q', directive: '.model BC557 PNP(BF=200 IS=1e-14 VAF=100)' },
    pins: [
      P(1, 'B', PinType.PASSIVE, -20,  0),
      P(2, 'C', PinType.PASSIVE,  12, -18),
      P(3, 'E', PinType.PASSIVE,  12,  18),
    ],
  },
  {
    partId:       'Q_NMOS_2N7000',
    partName:     'N-MOSFET',
    category:     'Passive',
    defaultValue: '2N7000',
    footprintId:  'TO92',
    spiceModel:   { type: 'M', directive: '.model 2N7000 NMOS(VTO=1.8 KP=0.08)' },
    pins: [
      P(1, 'G', PinType.INPUT,   -24, 0),
      P(2, 'D', PinType.PASSIVE,  14, -18),
      P(3, 'S', PinType.PASSIVE,  14,  18),
    ],
  },
  {
    partId:       'BTN_TACT',
    partName:     'Push Button',
    category:     'Passive',
    defaultValue: 'TACT',
    footprintId:  'SW_TACT_6mm',
    spiceModel:   null,
    pins: [
      P(1, 'A1', PinType.PASSIVE, -20, -10),
      P(2, 'A2', PinType.PASSIVE, -20,  10),
      P(3, 'B1', PinType.PASSIVE,  20, -10),
      P(4, 'B2', PinType.PASSIVE,  20,  10),
    ],
  },
  {
    partId:       'CRYSTAL',
    partName:     'Crystal',
    category:     'Passive',
    defaultValue: '16MHz',
    footprintId:  'Crystal_HC49',
    spiceModel:   null,
    pins: [
      P(1, 'XIN',  PinType.PASSIVE, -24, 0),
      P(2, 'XOUT', PinType.PASSIVE,  24, 0),
    ],
  },
  {
    partId:       'BUZZER',
    partName:     'Buzzer',
    category:     'Passive',
    defaultValue: '5V',
    footprintId:  'Buzzer_12mm',
    spiceModel:   null,
    pins: [
      P(1, '+', PinType.POWER_IN, -16, 0),
      P(2, '-', PinType.POWER_IN,  16, 0),
    ],
  },

  // ── Power ────────────────────────────────────────────────────────────────────
  {
    partId:   'PWR_VCC',
    partName: '+VCC',
    category: 'Power',
    defaultValue: '+3.3V',
    footprintId: null,
    spiceModel:  { type: 'V', directive: 'DC 3.3' },
    pins: [ P(1, 'VCC', PinType.POWER_OUT, 0, 20) ],
  },
  {
    partId:   'PWR_GND',
    partName: 'GND',
    category: 'Power',
    defaultValue: '0V',
    footprintId: null,
    spiceModel:  { type: 'V', directive: 'DC 0' },
    pins: [ P(1, 'GND', PinType.POWER_IN, 0, -20) ],
  },
  {
    partId:       'LM7805',
    partName:     'LM7805',
    category:     'Power',
    defaultValue: '5V/1A',
    footprintId:  'TO220-3',
    spiceModel:   { type: 'X', directive: '.subckt LM7805 IN GND OUT' },
    pins: [
      P(1, 'IN',  PinType.POWER_IN,   -30,  0),
      P(2, 'GND', PinType.POWER_IN,     0, 28),
      P(3, 'OUT', PinType.POWER_OUT,   30,  0),
    ],
  },
  {
    partId:       'LM317',
    partName:     'LM317',
    category:     'Power',
    defaultValue: 'ADJ',
    footprintId:  'TO220-3',
    spiceModel:   { type: 'X', directive: '.subckt LM317 IN ADJ OUT' },
    pins: [
      P(1, 'ADJ', PinType.INPUT,       0, 28),
      P(2, 'OUT', PinType.POWER_OUT,  30,  0),
      P(3, 'IN',  PinType.POWER_IN,  -30,  0),
    ],
  },
  {
    partId:       'AMS1117_3V3',
    partName:     'AMS1117-3.3',
    category:     'Power',
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

  // ── Microcontrollers ────────────────────────────────────────────────────────
  {
    partId:       'ESP32_WROOM',
    partName:     'ESP32-WROOM',
    category:     'MCU',
    defaultValue: '',
    footprintId:  'ESP32_WROOM_32',
    spiceModel:   null,
    pins: [
      P(1,  'GND',         PinType.POWER_IN,      -40, -60),
      P(2,  '3V3',         PinType.POWER_IN,      -40, -50),
      P(3,  'EN',          PinType.INPUT,          -40, -40),
      P(4,  'GPIO36',      PinType.INPUT,          -40, -30),
      P(5,  'GPIO39',      PinType.INPUT,          -40, -20),
      P(6,  'GPIO34',      PinType.INPUT,          -40, -10),
      P(7,  'GPIO35',      PinType.INPUT,          -40,   0),
      P(8,  'GPIO32',      PinType.BIDIRECTIONAL,  -40,  10),
      P(9,  'GPIO33',      PinType.BIDIRECTIONAL,  -40,  20),
      P(10, 'GPIO25',      PinType.BIDIRECTIONAL,  -40,  30),
      P(11, 'GPIO26',      PinType.BIDIRECTIONAL,  -40,  40),
      P(12, 'GPIO27',      PinType.BIDIRECTIONAL,  -40,  50),
      P(13, 'GPIO14',      PinType.BIDIRECTIONAL,  -40,  60),
      P(14, 'GPIO12',      PinType.BIDIRECTIONAL,   40,  60),
      P(15, 'GPIO13',      PinType.BIDIRECTIONAL,   40,  50),
      P(16, 'GPIO15',      PinType.BIDIRECTIONAL,   40,  40),
      P(17, 'GPIO2',       PinType.BIDIRECTIONAL,   40,  30),
      P(18, 'GPIO0',       PinType.BIDIRECTIONAL,   40,  20),
      P(19, 'GPIO4',       PinType.BIDIRECTIONAL,   40,  10),
      P(20, 'GPIO16/TX2',  PinType.OUTPUT,          40,   0),
      P(21, 'GPIO17/RX2',  PinType.INPUT,           40, -10),
      P(22, 'GPIO5/SS',    PinType.OUTPUT,          40, -20),
      P(23, 'GPIO18/SCK',  PinType.OUTPUT,          40, -30),
      P(24, 'GPIO19/MISO', PinType.INPUT,           40, -40),
      P(25, 'GPIO21/SDA',  PinType.BIDIRECTIONAL,   40, -50),
      P(26, 'GPIO22/SCL',  PinType.OUTPUT,          40, -60),
      P(27, 'GPIO23/MOSI', PinType.OUTPUT,           0,  70),
      P(28, 'GND2',        PinType.POWER_IN,         0, -70),
    ],
  },
  {
    partId:       'ARDUINO_UNO',
    partName:     'Arduino Uno',
    category:     'MCU',
    defaultValue: 'ATmega328P',
    footprintId:  'Arduino_UNO_R3',
    spiceModel:   null,
    pins: [
      ...rowL(1,
        ['D0/RX','D1/TX','D2','D3~','D4','D5~','D6~','D7','A0','A1','A2','A3','A4/SDA','A5/SCL'],
        Array(8).fill(PinType.BIDIRECTIONAL).concat(Array(4).fill(PinType.BIDIRECTIONAL),
          [PinType.BIDIRECTIONAL, PinType.BIDIRECTIONAL])
      ),
      ...rowR(15,
        ['D8','D9~','D10~','D11~/MOSI','D12/MISO','D13/LED','AREF','RESET','VIN','5V','3.3V','GND'],
        Array(8).fill(PinType.BIDIRECTIONAL).concat([PinType.INPUT,
          PinType.POWER_IN, PinType.POWER_OUT, PinType.POWER_OUT, PinType.POWER_IN])
      ),
    ],
  },
  {
    partId:       'ARDUINO_NANO',
    partName:     'Arduino Nano',
    category:     'MCU',
    defaultValue: 'ATmega328P',
    footprintId:  'Arduino_Nano',
    spiceModel:   null,
    pins: [
      ...rowL(1,
        ['D1/TX','D0/RX','RESET','GND','D2','D3~','D4','D5~','D6~','D7','D8','D9~','D10~','D11~/MOSI','D12/MISO','D13'],
        Array(16).fill(PinType.BIDIRECTIONAL)
      ),
      ...rowR(17,
        ['3.3V','AREF','A0','A1','A2','A3','A4/SDA','A5/SCL','A6','A7','5V','RESET','GND','VIN'],
        [PinType.POWER_OUT,PinType.INPUT,...Array(8).fill(PinType.BIDIRECTIONAL),
          PinType.POWER_OUT,PinType.INPUT,PinType.POWER_IN,PinType.POWER_IN]
      ),
    ],
  },
  {
    partId:       'ARDUINO_MEGA',
    partName:     'Arduino Mega',
    category:     'MCU',
    defaultValue: 'ATmega2560',
    footprintId:  'Arduino_MEGA2560_R3',
    spiceModel:   null,
    pins: [
      ...rowL(1,
        ['D22','D24','D26','D28','D30','D32','D34','D36','D38','D40','D42','D44','D46','D48','D50/MISO','D52/SCK','D53/SS','D51/MOSI'],
        Array(18).fill(PinType.BIDIRECTIONAL)
      ),
      ...rowR(19,
        ['D23','D25','D27','D29','D31','D33','D35','D37','D39','D41','D43','D45','D47','D49','5V','3.3V','GND','VIN'],
        Array(14).fill(PinType.BIDIRECTIONAL).concat([PinType.POWER_OUT,PinType.POWER_OUT,PinType.POWER_IN,PinType.POWER_IN])
      ),
    ],
  },
  {
    partId:       'ESP8266_12F',
    partName:     'ESP8266-12F',
    category:     'MCU',
    defaultValue: 'ESP8266',
    footprintId:  'ESP8266-12F',
    spiceModel:   null,
    pins: [
      ...rowL(1,
        ['RST','ADC','EN','GPIO16','GPIO14','GPIO12','GPIO13','GPIO15','GPIO2','GPIO0'],
        [PinType.INPUT,PinType.INPUT,...Array(8).fill(PinType.BIDIRECTIONAL)]
      ),
      ...rowR(11,
        ['VCC','TXD','RXD','GPIO1','GPIO3','GND'],
        [PinType.POWER_IN,PinType.OUTPUT,PinType.INPUT,...Array(2).fill(PinType.BIDIRECTIONAL),PinType.POWER_IN]
      ),
    ],
  },
  {
    partId:       'STM32F103C8',
    partName:     'STM32F103C8',
    category:     'MCU',
    defaultValue: 'BluePill',
    footprintId:  'LQFP48',
    spiceModel:   null,
    pins: [
      ...rowL(1,
        ['VDD','NRST','PC13','PC14','PC15','PA0','PA1','PA2','PA3','PA4','PA5','PA6','PA7','PB0','PB1','PB10','PB11','PB12'],
        [PinType.POWER_IN,PinType.INPUT,...Array(16).fill(PinType.BIDIRECTIONAL)]
      ),
      ...rowR(19,
        ['PA8','PA9/TX1','PA10/RX1','PA11','PA12','PA15','PB3','PB4','PB5','PB6/SCL','PB7/SDA','PB8','PB9','PC13_LED','GND','GND2','VBAT','3.3V'],
        Array(14).fill(PinType.BIDIRECTIONAL).concat([PinType.POWER_IN,PinType.POWER_IN,PinType.POWER_IN,PinType.POWER_IN])
      ),
    ],
  },
  {
    partId:       'ATTINY85',
    partName:     'ATtiny85',
    category:     'MCU',
    defaultValue: '8MHz',
    footprintId:  'DIP8',
    spiceModel:   null,
    pins: [
      P(1, 'RESET/PB5', PinType.INPUT,  -30, -21),
      P(2, 'PB3/ADC3',  PinType.BIDIRECTIONAL, -30, -7),
      P(3, 'PB4/ADC2',  PinType.BIDIRECTIONAL, -30,  7),
      P(4, 'GND',       PinType.POWER_IN,       -30, 21),
      P(5, 'PB0/SDA',   PinType.BIDIRECTIONAL,   30, 21),
      P(6, 'PB1/MISO',  PinType.BIDIRECTIONAL,   30,  7),
      P(7, 'PB2/SCK',   PinType.BIDIRECTIONAL,   30, -7),
      P(8, 'VCC',       PinType.POWER_IN,         30,-21),
    ],
  },
  {
    partId:       'RPIPICO',
    partName:     'RPi Pico',
    category:     'MCU',
    defaultValue: 'RP2040',
    footprintId:  'RPi_Pico',
    spiceModel:   null,
    pins: [
      ...rowL(1,
        ['GP0/TX','GP1/RX','GND','GP2','GP3','GP4/SDA','GP5/SCL','GND2','GP6','GP7','GP8','GP9','GND3','GP10','GP11','GP12','GP13','GND4','GP14','GP15'],
        [PinType.BIDIRECTIONAL,PinType.BIDIRECTIONAL,PinType.POWER_IN,...Array(17).fill(PinType.BIDIRECTIONAL)]
      ),
      ...rowR(21,
        ['VBUS','VSYS','GND5','3.3V','3.3V_EN','ADC_REF','GP26/A0','GP27/A1','GP28/A2','AGND','GP22','GND6','GP21','GP20','GP19/MOSI','GP18/SCK','GND7','GP17/SS','GP16/MISO','RUN'],
        [PinType.POWER_IN,PinType.POWER_IN,PinType.POWER_IN,PinType.POWER_OUT,
          PinType.INPUT,...Array(15).fill(PinType.BIDIRECTIONAL),PinType.INPUT]
      ),
    ],
  },
  {
    partId:       'ATMEGA328P',
    partName:     'ATmega328P',
    category:     'MCU',
    defaultValue: '16MHz',
    footprintId:  'DIP28',
    spiceModel:   null,
    pins: [
      ...rowL(1,
        ['PC6/RESET','PD0/RX','PD1/TX','PD2','PD3~','PD4','VCC','GND','XTAL1','XTAL2','PD5~','PD6~','PD7','PB0'],
        [PinType.INPUT,...Array(6).fill(PinType.BIDIRECTIONAL),PinType.POWER_IN,PinType.POWER_IN,...Array(5).fill(PinType.BIDIRECTIONAL)]
      ),
      ...rowR(15,
        ['PB1~','PB2/SS','PB3~/MOSI','PB4/MISO','PB5/SCK','AVCC','AREF','GND2','PC0/A0','PC1/A1','PC2/A2','PC3/A3','PC4/A4/SDA','PC5/A5/SCL'],
        Array(5).fill(PinType.BIDIRECTIONAL).concat([PinType.POWER_IN,PinType.INPUT,PinType.POWER_IN,...Array(6).fill(PinType.BIDIRECTIONAL)])
      ),
    ],
  },

  // ── Sensors ─────────────────────────────────────────────────────────────────
  {
    partId:       'BME280',
    partName:     'BME280',
    category:     'Sensor',
    defaultValue: 'Temp/Hum/Press',
    footprintId:  'BME280_LGA8',
    spiceModel:   null,
    pins: [
      P(1, 'VCC',  PinType.POWER_IN,      -30, -20),
      P(2, 'GND',  PinType.POWER_IN,      -30,  20),
      P(3, 'SDI',  PinType.BIDIRECTIONAL,  30, -20),
      P(4, 'SCK',  PinType.INPUT,          30,   0),
      P(5, 'SDO',  PinType.OUTPUT,         30,  20),
      P(6, 'CSB',  PinType.INPUT,           0, -30),
      P(7, 'VDDIO',PinType.POWER_IN,      -30,   0),
    ],
  },
  {
    partId:       'DHT22',
    partName:     'DHT22',
    category:     'Sensor',
    defaultValue: 'Temp/Humidity',
    footprintId:  'DHT22',
    spiceModel:   null,
    pins: [
      P(1, 'VCC',  PinType.POWER_IN,   -30, -15),
      P(2, 'DATA', PinType.OUTPUT,      30, -15),
      P(3, 'NC',   PinType.PASSIVE,     30,   0),
      P(4, 'GND',  PinType.POWER_IN,   -30,  15),
    ],
  },
  {
    partId:       'HC_SR04',
    partName:     'HC-SR04',
    category:     'Sensor',
    defaultValue: 'Ultrasonic',
    footprintId:  'HC_SR04',
    spiceModel:   null,
    pins: [
      P(1, 'VCC',   PinType.POWER_IN,   -30, -15),
      P(2, 'TRIG',  PinType.INPUT,       30, -15),
      P(3, 'ECHO',  PinType.OUTPUT,      30,  15),
      P(4, 'GND',   PinType.POWER_IN,   -30,  15),
    ],
  },
  {
    partId:       'MPU6050',
    partName:     'MPU-6050',
    category:     'Sensor',
    defaultValue: '6-axis IMU',
    footprintId:  'QFN24',
    spiceModel:   null,
    pins: [
      P(1, 'VCC',   PinType.POWER_IN,      -35, -28),
      P(2, 'GND',   PinType.POWER_IN,      -35,  28),
      P(3, 'SCL',   PinType.INPUT,          35, -28),
      P(4, 'SDA',   PinType.BIDIRECTIONAL,  35,   0),
      P(5, 'INT',   PinType.OUTPUT,         35,  28),
      P(6, 'AD0',   PinType.INPUT,         -35,   0),
    ],
  },
  {
    partId:       'DS18B20',
    partName:     'DS18B20',
    category:     'Sensor',
    defaultValue: '1-Wire Temp',
    footprintId:  'TO92',
    spiceModel:   null,
    pins: [
      P(1, 'GND',  PinType.POWER_IN,      -25, 0),
      P(2, 'DQ',   PinType.BIDIRECTIONAL,  25, 0),
      P(3, 'VDD',  PinType.POWER_IN,        0,-28),
    ],
  },
  {
    partId:       'LDR',
    partName:     'LDR',
    category:     'Sensor',
    defaultValue: '10k@lux',
    footprintId:  'R_TH_5mm',
    spiceModel:   { type: 'R', directive: null },
    pins: [
      P(1, 'P1', PinType.PASSIVE, -20, 0),
      P(2, 'P2', PinType.PASSIVE,  20, 0),
    ],
  },
  {
    partId:       'NTC_10K',
    partName:     'NTC 10K',
    category:     'Sensor',
    defaultValue: '10k@25°C',
    footprintId:  'R_TH_5mm',
    spiceModel:   { type: 'R', directive: null },
    pins: [
      P(1, 'P1', PinType.PASSIVE, -20, 0),
      P(2, 'P2', PinType.PASSIVE,  20, 0),
    ],
  },
  {
    partId:       'PIR_HCSR501',
    partName:     'PIR HC-SR501',
    category:     'Sensor',
    defaultValue: 'Motion',
    footprintId:  'HC_SR501',
    spiceModel:   null,
    pins: [
      P(1, 'VCC', PinType.POWER_IN,   -25, 0),
      P(2, 'OUT', PinType.OUTPUT,       25, 0),
      P(3, 'GND', PinType.POWER_IN,     0, 28),
    ],
  },

  // ── Displays ─────────────────────────────────────────────────────────────────
  {
    partId:       'SSD1306_OLED',
    partName:     'OLED SSD1306',
    category:     'Display',
    defaultValue: '128x64 I2C',
    footprintId:  'OLED_0.96in',
    spiceModel:   null,
    pins: [
      P(1, 'VCC', PinType.POWER_IN,   -30, -15),
      P(2, 'GND', PinType.POWER_IN,   -30,  15),
      P(3, 'SCL', PinType.INPUT,       30, -15),
      P(4, 'SDA', PinType.BIDIRECTIONAL, 30, 15),
    ],
  },
  {
    partId:       'LCD_1602',
    partName:     'LCD 16x2',
    category:     'Display',
    defaultValue: 'Character LCD',
    footprintId:  'LCD_16x2',
    spiceModel:   null,
    pins: [
      ...rowL(1,
        ['VSS','VDD','VEE','RS','RW','E','D0','D1'],
        [PinType.POWER_IN,PinType.POWER_IN,PinType.INPUT,...Array(5).fill(PinType.INPUT)]
      ),
      ...rowR(9,
        ['D2','D3','D4','D5','D6','D7','A(LED+)','K(LED-)'],
        Array(6).fill(PinType.INPUT).concat([PinType.POWER_IN,PinType.POWER_IN])
      ),
    ],
  },

  // ── Drivers / ICs ────────────────────────────────────────────────────────────
  {
    partId:       'L293D',
    partName:     'L293D',
    category:     'Driver',
    defaultValue: 'Motor Driver',
    footprintId:  'DIP16',
    spiceModel:   null,
    pins: [
      P(1,  'EN1',  PinType.INPUT,   -40, -49),
      P(2,  'IN1',  PinType.INPUT,   -40, -35),
      P(3,  'OUT1', PinType.OUTPUT,  -40, -21),
      P(4,  'GND',  PinType.POWER_IN,-40,  -7),
      P(5,  'GND2', PinType.POWER_IN,-40,   7),
      P(6,  'OUT2', PinType.OUTPUT,  -40,  21),
      P(7,  'IN2',  PinType.INPUT,   -40,  35),
      P(8,  'VS',   PinType.POWER_IN,-40,  49),
      P(9,  'EN2',  PinType.INPUT,    40, -49),
      P(10, 'IN3',  PinType.INPUT,    40, -35),
      P(11, 'OUT3', PinType.OUTPUT,   40, -21),
      P(12, 'GND3', PinType.POWER_IN, 40,  -7),
      P(13, 'GND4', PinType.POWER_IN, 40,   7),
      P(14, 'OUT4', PinType.OUTPUT,   40,  21),
      P(15, 'IN4',  PinType.INPUT,    40,  35),
      P(16, 'VSS',  PinType.POWER_IN, 40,  49),
    ],
  },
  {
    partId:       'ULN2003',
    partName:     'ULN2003',
    category:     'Driver',
    defaultValue: 'Darlington',
    footprintId:  'DIP16',
    spiceModel:   null,
    pins: [
      ...rowL(1,  ['IN1','IN2','IN3','IN4','IN5','IN6','IN7','COM'], Array(7).fill(PinType.INPUT).concat([PinType.POWER_IN])),
      ...rowR(9,  ['OUT1','OUT2','OUT3','OUT4','OUT5','OUT6','OUT7','GND'], Array(7).fill(PinType.OUTPUT).concat([PinType.POWER_IN])),
    ],
  },

  // ── Connectors ───────────────────────────────────────────────────────────────
  {
    partId:       'CONN_2PIN',
    partName:     'Conn 2-Pin',
    category:     'Connector',
    defaultValue: 'JST/Header',
    footprintId:  'Connector_2pin_2.54mm',
    spiceModel:   null,
    pins: [
      P(1, 'P1', PinType.PASSIVE, -25, -7),
      P(2, 'P2', PinType.PASSIVE, -25,  7),
    ],
  },
  {
    partId:       'CONN_3PIN',
    partName:     'Conn 3-Pin',
    category:     'Connector',
    defaultValue: '2.54mm',
    footprintId:  'Connector_3pin_2.54mm',
    spiceModel:   null,
    pins: [
      P(1, 'P1', PinType.PASSIVE, -25, -14),
      P(2, 'P2', PinType.PASSIVE, -25,   0),
      P(3, 'P3', PinType.PASSIVE, -25,  14),
    ],
  },
  {
    partId:       'CONN_4PIN',
    partName:     'Conn 4-Pin',
    category:     'Connector',
    defaultValue: '2.54mm',
    footprintId:  'Connector_4pin_2.54mm',
    spiceModel:   null,
    pins: [
      P(1, 'P1', PinType.PASSIVE, -25, -21),
      P(2, 'P2', PinType.PASSIVE, -25,  -7),
      P(3, 'P3', PinType.PASSIVE, -25,   7),
      P(4, 'P4', PinType.PASSIVE, -25,  21),
    ],
  },
  {
    partId:       'CONN_USB_MICRO',
    partName:     'USB Micro-B',
    category:     'Connector',
    defaultValue: 'USB 2.0',
    footprintId:  'USB_Micro_B',
    spiceModel:   null,
    pins: [
      P(1, 'VBUS', PinType.POWER_IN,   -30, -14),
      P(2, 'D-',   PinType.BIDIRECTIONAL, 30, -14),
      P(3, 'D+',   PinType.BIDIRECTIONAL, 30,   0),
      P(4, 'ID',   PinType.INPUT,         30,  14),
      P(5, 'GND',  PinType.POWER_IN,     -30,  14),
    ],
  },
];

// Index by partId for fast lookup
export const LIBRARY_MAP = Object.fromEntries(
  COMPONENT_LIBRARY.map(c => [c.partId, c])
);
