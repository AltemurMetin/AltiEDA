/**
 * AltiEDA – AI-Assisted Pin Matcher & Smart Routing Logic
 *
 * On component placement this module:
 *  1. Detects power pins → suggests global power nets (VCC/GND)
 *  2. Detects communication bus pins (I2C/SPI/UART/PWM) and matches
 *     compatible pins on neighbouring components.
 *  3. Returns a list of {suggestion} objects for the canvas renderer.
 */
import { state }    from '../core/schematicState.js';
import { NetClass, PinType } from '../core/dataModels.js';

// ── Pattern tables ────────────────────────────────────────────────────────────
const POWER_PATTERNS = {
  VCC:  { regex: /^(VCC|VDD|3V3|5V|VDDIO|VBAT|VIN|3\.3V|5\.0V)/i, netClass: NetClass.POWER, netName: 'VCC' },
  GND:  { regex: /^(GND|VSS|AGND|DGND|PGND|GND\d*)/i,              netClass: NetClass.GND,   netName: 'GND' },
};

const BUS_PATTERNS = [
  // I2C
  { regex: /^(SDA|I2C_SDA|SDI)$/i,   bus: 'I2C', signal: 'SDA', netClass: NetClass.I2C },
  { regex: /^(SCL|I2C_SCL|SCK)$/i,   bus: 'I2C', signal: 'SCL', netClass: NetClass.I2C },
  // SPI
  { regex: /^(MOSI|SDO_SPI|GPIO23_MOSI)$/i, bus: 'SPI', signal: 'MOSI', netClass: NetClass.SPI },
  { regex: /^(MISO|SDI_SPI|GPIO19_MISO)$/i, bus: 'SPI', signal: 'MISO', netClass: NetClass.SPI },
  { regex: /^(SCK|SPI_CLK|GPIO18_SCK)$/i,   bus: 'SPI', signal: 'SCK',  netClass: NetClass.SPI },
  { regex: /^(CS|SS|NSS|CSB|GPIO5_SS)$/i,   bus: 'SPI', signal: 'CS',   netClass: NetClass.SPI },
  // UART
  { regex: /^(TX|UART_TX|GPIO16_TX|TXD)$/i, bus: 'UART', signal: 'TX', netClass: NetClass.UART },
  { regex: /^(RX|UART_RX|GPIO17_RX|RXD)$/i, bus: 'UART', signal: 'RX', netClass: NetClass.UART },
  // PWM
  { regex: /^(PWM|GPIO14_PWM|PWM\d*)$/i,    bus: 'PWM',  signal: 'PWM', netClass: NetClass.PWM },
];

// UART TX→RX cross-connects
const UART_CROSS = { TX: 'RX', RX: 'TX' };

// ── Classification helpers ────────────────────────────────────────────────────
export function classifyPin(pinName) {
  for (const [, pat] of Object.entries(POWER_PATTERNS)) {
    if (pat.regex.test(pinName)) {
      return { type: 'power', netClass: pat.netClass, netName: pat.netName };
    }
  }
  for (const bp of BUS_PATTERNS) {
    if (bp.regex.test(pinName)) {
      return { type: 'bus', bus: bp.bus, signal: bp.signal, netClass: bp.netClass };
    }
  }
  return null;
}

// ── Core: generate suggestions after placing a component ──────────────────────
export function generateSuggestions(placedComp) {
  const suggestions = [];

  // 1. Power pins → global net suggestions
  for (const pin of placedComp.pins) {
    const cls = classifyPin(pin.name);
    if (!cls) continue;

    if (cls.type === 'power') {
      // Find or create global power net
      const net = state.getOrCreateNet(cls.netName, cls.netClass);
      // Find any existing power symbol or nearest pin on same net
      const target = _findNearestNetPin(placedComp, net.id);
      if (target) {
        suggestions.push({
          fromX:    placedComp.x + pin.offsetX,
          fromY:    placedComp.y + pin.offsetY,
          toX:      target.x,
          toY:      target.y,
          netClass: cls.netClass,
          netId:    net.id,
          netName:  cls.netName,
          label:    cls.netName,
          fromPin:  { componentId: placedComp.id, pinNumber: pin.number },
          toPin:    target.pin,
          confidence: 0.95,
        });
      } else {
        // No existing pin – suggest a power symbol stub
        suggestions.push({
          fromX:    placedComp.x + pin.offsetX,
          fromY:    placedComp.y + pin.offsetY,
          toX:      placedComp.x + pin.offsetX,
          toY:      placedComp.y + pin.offsetY - 20,
          netClass: cls.netClass,
          netId:    net.id,
          netName:  cls.netName,
          label:    cls.netName,
          fromPin:  { componentId: placedComp.id, pinNumber: pin.number },
          toPin:    null,
          confidence: 0.90,
        });
      }
    }
  }

  // 2. Bus / signal matching with other placed components
  const busMatches = _matchBusPins(placedComp);
  suggestions.push(...busMatches);

  return suggestions;
}

// ── Internal: find nearest pin already on a given net ─────────────────────────
function _findNearestNetPin(comp, netId) {
  let best = null, bestDist = Infinity;
  for (const other of Object.values(state.schematic.components)) {
    if (other.id === comp.id) continue;
    for (const pin of other.pins) {
      if (pin.netId !== netId) continue;
      const dx = other.x + pin.offsetX - comp.x;
      const dy = other.y + pin.offsetY - comp.y;
      const d  = Math.hypot(dx, dy);
      if (d < bestDist) {
        bestDist = d;
        best = {
          x:   other.x + pin.offsetX,
          y:   other.y + pin.offsetY,
          pin: { componentId: other.id, pinNumber: pin.number },
        };
      }
    }
  }
  return best;
}

// ── Internal: bus pin matching across all placed components ───────────────────
function _matchBusPins(newComp) {
  const sugs = [];
  // Map: signal → [{ comp, pin, cls }]
  const inventory = {};

  // Index existing components
  for (const comp of Object.values(state.schematic.components)) {
    if (comp.id === newComp.id) continue;
    for (const pin of comp.pins) {
      const cls = classifyPin(pin.name);
      if (!cls || cls.type !== 'bus') continue;
      const key = `${cls.bus}:${cls.signal}`;
      (inventory[key] = inventory[key] ?? []).push({ comp, pin, cls });
    }
  }

  // Match new component pins
  for (const pin of newComp.pins) {
    const cls = classifyPin(pin.name);
    if (!cls || cls.type !== 'bus') continue;

    // UART cross-connect (TX↔RX)
    const matchSignal = cls.bus === 'UART'
      ? (UART_CROSS[cls.signal] ?? cls.signal)
      : cls.signal;

    const key = `${cls.bus}:${matchSignal}`;
    const candidates = inventory[key] ?? [];

    if (!candidates.length) continue;

    // Pick closest candidate
    let best = null, bestDist = Infinity;
    for (const cand of candidates) {
      const dx = cand.comp.x + cand.pin.offsetX - newComp.x - pin.offsetX;
      const dy = cand.comp.y + cand.pin.offsetY - newComp.y - pin.offsetY;
      const d  = Math.hypot(dx, dy);
      if (d < bestDist) { bestDist = d; best = cand; }
    }

    if (!best) continue;

    // Ensure shared net
    const netName = `${cls.bus}_${cls.signal}`;
    const net     = state.getOrCreateNet(netName, cls.netClass);

    sugs.push({
      fromX:    newComp.x + pin.offsetX,
      fromY:    newComp.y + pin.offsetY,
      toX:      best.comp.x + best.pin.offsetX,
      toY:      best.comp.y + best.pin.offsetY,
      netClass: cls.netClass,
      netId:    net.id,
      netName,
      label:    `${cls.bus} ${cls.signal}`,
      fromPin:  { componentId: newComp.id, pinNumber: pin.number },
      toPin:    { componentId: best.comp.id, pinNumber: best.pin.number },
      confidence: 0.85,
    });
  }

  return sugs;
}

// ── Accept a suggestion → assign nets ────────────────────────────────────────
export function acceptSuggestion(suggestion) {
  const { netId, fromPin, toPin } = suggestion;
  if (fromPin) state.assignPinToNet(fromPin.componentId, fromPin.pinNumber, netId);
  if (toPin)   state.assignPinToNet(toPin.componentId,   toPin.pinNumber,   netId);
}

// ── Accept all suggestions for a component ────────────────────────────────────
export function acceptAllSuggestions(suggestions) {
  suggestions.forEach(acceptSuggestion);
}
