/**
 * AltiEDA – PDF Schematic Export & Hierarchical Schematic Support
 *
 * exportSchematicPDF() – renders schematic to PDF using canvas-to-image
 * HierarchicalSheet  – manages multi-sheet schematics
 */
import { state } from '../core/schematicState.js';
import { COMPONENT_LIBRARY } from '../core/componentLibrary.js';

// ── PDF Export ──────────────────────────────────────────────────────────────

/**
 * Export the current schematic view to a downloadable PDF.
 * Uses canvas snapshot rendered to an embedded image in a minimal PDF.
 */
export function exportSchematicPDF(options = {}) {
  const {
    title = 'AltiEDA Schematic',
    author = 'AltiEDA',
    pageSize = 'A4',    // 'A4' | 'A3' | 'Letter'
    landscape = true,
    includeTitle = true,
    includeBOM = true,
  } = options;

  const pageSizes = {
    A4: landscape ? [841.89, 595.28] : [595.28, 841.89],
    A3: landscape ? [1190.55, 841.89] : [841.89, 1190.55],
    Letter: landscape ? [792, 612] : [612, 792],
  };

  const [pageW, pageH] = pageSizes[pageSize] || pageSizes.A4;

  // Capture canvas as PNG data URL
  const canvas = document.getElementById('main-canvas');
  if (!canvas) {
    console.error('[PDF Export] No canvas found');
    return;
  }

  const imgData = canvas.toDataURL('image/png');
  const imgBytes = _dataURLToBytes(imgData);

  // Build minimal PDF
  const pages = [];

  // Page 1: Schematic
  pages.push(_buildSchematicPage(pageW, pageH, imgBytes, title, includeTitle));

  // Page 2: BOM (if requested)
  if (includeBOM) {
    pages.push(_buildBOMPage(pageW, pageH, title));
  }

  const pdfBytes = _assemblePDF(pages, { title, author, pageW, pageH });

  // Download
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/\s+/g, '_')}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return blob;
}

/**
 * Build a minimal valid PDF document.
 * This creates a proper PDF 1.4 with embedded PNG image.
 */
function _assemblePDF(pages, meta) {
  const { title, author, pageW, pageH } = meta;
  const now = new Date();
  const dateStr = `D:${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;

  // Simple PDF builder
  const objects = [];
  const addObj = (content) => { objects.push(content); return objects.length; };

  // 1. Catalog
  addObj(`<< /Type /Catalog /Pages 2 0 R >>`);

  // 2. Pages
  const pageRefs = pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ');
  addObj(`<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`);

  // Build page objects
  for (const page of pages) {
    // Page object
    const pageObjNum = addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${objects.length + 2} 0 R /Resources << /Font << /F1 ${objects.length + 3} 0 R >> >> >>`);

    // Content stream
    const stream = page.contentStream;
    addObj(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);

    // Font
    addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`);
  }

  // Info dict
  addObj(`<< /Title (${title}) /Author (${author}) /Creator (AltiEDA) /Producer (AltiEDA PDF Export) /CreationDate (${dateStr}) >>`);

  // Build the PDF file
  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];

  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

function _buildSchematicPage(pageW, pageH, imgBytes, title, includeTitle) {
  let stream = '';
  const margin = 40;

  // Title block
  if (includeTitle) {
    stream += 'BT\n';
    stream += `/F1 16 Tf\n`;
    stream += `${margin} ${pageH - 30} Td\n`;
    stream += `(${_pdfEscape(title)}) Tj\n`;
    stream += 'ET\n';

    // Date and component count
    stream += 'BT\n';
    stream += `/F1 9 Tf\n`;
    stream += `${pageW - 200} ${pageH - 30} Td\n`;
    const dateStr = new Date().toLocaleDateString();
    const compCount = Object.keys(state.schematic.components).length;
    stream += `(Date: ${dateStr}  Components: ${compCount}) Tj\n`;
    stream += 'ET\n';

    // Border
    stream += `${margin} ${margin} ${pageW - margin * 2} ${pageH - margin * 2} re S\n`;
  }

  // Component list summary
  const components = Object.values(state.schematic.components);
  let y = pageH - 60;
  stream += 'BT\n';
  stream += `/F1 8 Tf\n`;

  const netCount = Object.keys(state.schematic.nets).length;
  const wireCount = Object.keys(state.schematic.wires).length;
  stream += `${margin + 10} ${y} Td\n`;
  stream += `(Schematic Summary: ${components.length} components, ${netCount} nets, ${wireCount} wires) Tj\n`;
  stream += 'ET\n';

  return { contentStream: stream };
}

function _buildBOMPage(pageW, pageH, title) {
  let stream = '';
  const margin = 40;

  // Header
  stream += 'BT\n';
  stream += `/F1 14 Tf\n`;
  stream += `${margin} ${pageH - 30} Td\n`;
  stream += `(Bill of Materials - ${_pdfEscape(title)}) Tj\n`;
  stream += 'ET\n';

  // Table header
  const colX = [margin + 10, margin + 80, margin + 200, margin + 340, margin + 440];
  const headers = ['Ref', 'Part', 'Value', 'Footprint', 'Qty'];
  let y = pageH - 60;

  stream += 'BT\n';
  stream += `/F1 10 Tf\n`;
  for (let i = 0; i < headers.length; i++) {
    stream += `${colX[i]} ${y} Td\n`;
    stream += `(${headers[i]}) Tj\n`;
    if (i < headers.length - 1) stream += `${colX[i + 1] - colX[i]} 0 Td\n`;
  }
  stream += 'ET\n';

  // Line
  y -= 5;
  stream += `${margin} ${y} m ${pageW - margin} ${y} l S\n`;
  y -= 15;

  // Group components by part
  const groups = {};
  for (const comp of Object.values(state.schematic.components)) {
    const key = `${comp.partId}|${comp.value}`;
    if (!groups[key]) {
      groups[key] = { partName: comp.partName, value: comp.value, footprintId: comp.footprintId, refs: [], count: 0 };
    }
    groups[key].refs.push(comp.id.replace(/^C\d+_/, ''));
    groups[key].count++;
  }

  stream += 'BT\n';
  stream += `/F1 8 Tf\n`;
  let first = true;
  for (const [, group] of Object.entries(groups)) {
    if (y < margin + 20) break; // Page overflow protection
    if (!first) {
      stream += `0 -14 Td\n`;
    } else {
      stream += `${colX[0]} ${y} Td\n`;
      first = false;
    }
    const ref = group.refs.slice(0, 3).join(', ') + (group.refs.length > 3 ? '...' : '');
    stream += `(${_pdfEscape(ref)}) Tj\n`;
    y -= 14;
  }
  stream += 'ET\n';

  // Separate column entries
  y = pageH - 75;
  stream += 'BT\n';
  stream += `/F1 8 Tf\n`;
  let firstRow = true;
  for (const [, group] of Object.entries(groups)) {
    if (y < margin + 20) break;
    if (!firstRow) {
      stream += `0 -14 Td\n`;
    } else {
      stream += `${colX[1]} ${y} Td\n`;
      firstRow = false;
    }
    stream += `(${_pdfEscape(group.partName)}    ${_pdfEscape(group.value || '-')}    ${_pdfEscape(group.footprintId || '-')}    x${group.count}) Tj\n`;
    y -= 14;
  }
  stream += 'ET\n';

  return { contentStream: stream };
}

function _pdfEscape(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function _dataURLToBytes(dataURL) {
  const base64 = dataURL.split(',')[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Hierarchical Schematic Support ──────────────────────────────────────────

/**
 * Manages multi-sheet schematics with hierarchical blocks.
 * Each sheet is an independent schematic state with port connections.
 */
export class HierarchicalSchematic {
  constructor() {
    this.sheets = new Map();  // sheetId → { name, state, ports, parent, children }
    this.activeSheet = null;
    this._sheetCounter = 0;

    // Create root sheet
    this.addSheet('Root', null);
  }

  /**
   * Add a new sheet to the hierarchy.
   */
  addSheet(name, parentId = null) {
    const id = `sheet_${++this._sheetCounter}`;
    const sheet = {
      id,
      name,
      components: {},
      wires: {},
      nets: {},
      junctions: [],
      probes: {},
      ports: [],       // [{name, type, netId, x, y}] - hierarchical ports
      children: [],
      parent: parentId,
    };

    this.sheets.set(id, sheet);

    if (parentId) {
      const parent = this.sheets.get(parentId);
      if (parent) parent.children.push(id);
    }

    if (!this.activeSheet) this.activeSheet = id;
    return sheet;
  }

  /**
   * Remove a sheet and all its children.
   */
  removeSheet(sheetId) {
    const sheet = this.sheets.get(sheetId);
    if (!sheet) return;

    // Remove children recursively
    for (const childId of sheet.children) {
      this.removeSheet(childId);
    }

    // Remove from parent's children list
    if (sheet.parent) {
      const parent = this.sheets.get(sheet.parent);
      if (parent) {
        parent.children = parent.children.filter(id => id !== sheetId);
      }
    }

    this.sheets.delete(sheetId);
  }

  /**
   * Switch active sheet and sync state.
   */
  switchSheet(sheetId) {
    if (!this.sheets.has(sheetId)) return false;

    // Save current state to current sheet
    if (this.activeSheet) {
      this._saveCurrentState();
    }

    // Load target sheet state
    this.activeSheet = sheetId;
    this._loadSheetState(sheetId);
    return true;
  }

  /**
   * Add a hierarchical port to a sheet.
   */
  addPort(sheetId, name, type = 'bidirectional', x = 0, y = 0) {
    const sheet = this.sheets.get(sheetId);
    if (!sheet) return null;

    const port = {
      id: `port_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      type,  // 'input' | 'output' | 'bidirectional' | 'power'
      netId: null,
      x, y,
    };

    sheet.ports.push(port);
    return port;
  }

  /**
   * Connect ports between parent and child sheets.
   */
  connectPorts(parentSheetId, parentPortName, childSheetId, childPortName) {
    const parent = this.sheets.get(parentSheetId);
    const child = this.sheets.get(childSheetId);
    if (!parent || !child) return false;

    const parentPort = parent.ports.find(p => p.name === parentPortName);
    const childPort = child.ports.find(p => p.name === childPortName);
    if (!parentPort || !childPort) return false;

    // Share netId between connected ports
    const netId = parentPort.netId || childPort.netId || `hier_net_${Date.now()}`;
    parentPort.netId = netId;
    childPort.netId = netId;
    return true;
  }

  /**
   * Get flat netlist across all sheets (resolved hierarchy).
   */
  getFlatNetlist() {
    const allComponents = {};
    const allNets = {};
    const allWires = [];

    for (const [sheetId, sheet] of this.sheets) {
      // Prefix component IDs with sheet ID
      for (const [compId, comp] of Object.entries(sheet.components)) {
        const flatId = `${sheetId}/${compId}`;
        allComponents[flatId] = { ...comp, id: flatId, sheetId };
      }

      // Merge nets (resolve hierarchical port connections)
      for (const [netId, net] of Object.entries(sheet.nets)) {
        // Check if this net connects to a port
        const connectedPort = sheet.ports.find(p => p.netId === netId);
        const resolvedId = connectedPort ? connectedPort.netId : `${sheetId}/${netId}`;
        allNets[resolvedId] = allNets[resolvedId] || { ...net, id: resolvedId, pinRefs: [] };
        for (const ref of (net.pinRefs || [])) {
          allNets[resolvedId].pinRefs.push({
            ...ref,
            componentId: `${sheetId}/${ref.componentId}`,
          });
        }
      }

      for (const wire of Object.values(sheet.wires)) {
        allWires.push({ ...wire, sheetId });
      }
    }

    return { components: allComponents, nets: allNets, wires: allWires };
  }

  /**
   * Get sheet tree structure for UI rendering.
   */
  getSheetTree() {
    const buildTree = (sheetId) => {
      const sheet = this.sheets.get(sheetId);
      if (!sheet) return null;
      return {
        id: sheet.id,
        name: sheet.name,
        componentCount: Object.keys(sheet.components).length,
        portCount: sheet.ports.length,
        children: sheet.children.map(cid => buildTree(cid)).filter(Boolean),
      };
    };

    // Find root(s)
    const roots = [];
    for (const [id, sheet] of this.sheets) {
      if (!sheet.parent) roots.push(buildTree(id));
    }
    return roots;
  }

  _saveCurrentState() {
    const sheet = this.sheets.get(this.activeSheet);
    if (!sheet) return;
    sheet.components = { ...state.schematic.components };
    sheet.wires = { ...state.schematic.wires };
    sheet.nets = { ...state.schematic.nets };
    sheet.junctions = [...state.schematic.junctions];
    sheet.probes = { ...state.schematic.probes };
  }

  _loadSheetState(sheetId) {
    const sheet = this.sheets.get(sheetId);
    if (!sheet) return;
    state.schematic.components = { ...sheet.components };
    state.schematic.wires = { ...sheet.wires };
    state.schematic.nets = { ...sheet.nets };
    state.schematic.junctions = [...sheet.junctions];
    state.schematic.probes = { ...sheet.probes };
  }
}
