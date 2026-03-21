/**
 * AltiEDA – SPICE Netlist Converter
 * JSON schematic netlist → standard SPICE netlist text.
 */
import { state } from '../core/schematicState.js';

/** Extract model name from a .model directive string */
function extractModelName(directive) {
  const m = directive.match(/^\.model\s+(\S+)/i);
  return m ? m[1] : null;
}

// ── Component → SPICE element line ────────────────────────────────────────────
function componentToSPICE(comp, netlist) {
  const model = comp.spiceModel;
  if (!model) return `* Component ${comp.id} (${comp.partName}) – no SPICE model\n`;

  // Resolve net nodes for each pin
  const nodes = comp.pins.map(pin => {
    const net = pin.netId ? netlist.nets[pin.netId] : null;
    return net ? net.name.replace(/\s+/g, '_') : '0';
  });

  switch (model.type) {
    case 'R':
      return `R${comp.id} ${nodes[0] ?? '0'} ${nodes[1] ?? '0'} ${comp.value}\n`;
    case 'C':
      return `C${comp.id} ${nodes[0] ?? '0'} ${nodes[1] ?? '0'} ${comp.value}\n`;
    case 'L':
      return `L${comp.id} ${nodes[0] ?? '0'} ${nodes[1] ?? '0'} ${comp.value}\n`;
    case 'D': {
      const mName = (model.directive && extractModelName(model.directive)) || 'DGENERIC';
      return `D${comp.id} ${nodes[0] ?? '0'} ${nodes[1] ?? '0'} ${mName}\n`;
    }
    case 'Q': {
      // BJT: Qname C B E modelname  (pins order in library: B=0, C=1, E=2)
      const mName = (model.directive && extractModelName(model.directive)) || 'QGENERIC';
      return `Q${comp.id} ${nodes[1] ?? '0'} ${nodes[0] ?? '0'} ${nodes[2] ?? '0'} ${mName}\n`;
    }
    case 'M': {
      // MOSFET: Mname D G S modelname  (pins order in library: G=0, D=1, S=2)
      const mName = (model.directive && extractModelName(model.directive)) || 'MGENERIC';
      return `M${comp.id} ${nodes[1] ?? '0'} ${nodes[0] ?? '0'} ${nodes[2] ?? '0'} ${mName}\n`;
    }
    case 'V':
      return `V${comp.id} ${nodes[0] ?? '0'} ${nodes[1] ?? '0'} ${model.directive ?? 'DC 0'}\n`;
    case 'X':
      return `X${comp.id} ${nodes.join(' ')} ${comp.partId}\n`;
    default:
      return `* Unknown type ${model.type} for ${comp.id}\n`;
  }
}

// ── Generate full SPICE netlist ───────────────────────────────────────────────
export function generateSPICENetlist(netlistJSON = null) {
  const nl = netlistJSON ?? buildNetlistJSON();
  const lines = [];

  lines.push(`* AltiEDA SPICE Netlist`);
  lines.push(`* Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Model and subckt definitions
  const models = new Set();
  for (const comp of Object.values(nl.components)) {
    const m = comp.spiceModel;
    if (!m || !m.directive) continue;
    if (!models.has(m.directive)) {
      models.add(m.directive);
      lines.push(m.directive);
    }
  }
  if (models.size) lines.push('');

  // Component elements
  for (const comp of Object.values(nl.components)) {
    lines.push(componentToSPICE(comp, nl));
  }

  // Simulation commands (transient by default)
  lines.push('');
  lines.push('.tran 10us 10ms');
  lines.push('.end');

  return lines.join('\n');
}

// ── Build netlist JSON from current state ─────────────────────────────────────
function buildNetlistJSON() {
  const comps = {};
  for (const comp of Object.values(state.schematic.components)) {
    comps[comp.id] = {
      id:         comp.id,
      partId:     comp.partId,
      partName:   comp.partName,
      value:      comp.value,
      spiceModel: comp.spiceModel,
      pins:       comp.pins,
    };
  }
  return { components: comps, nets: state.schematic.nets };
}
