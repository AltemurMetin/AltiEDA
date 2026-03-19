# AltiEDA – Professional Web-Based EDA Tool

A browser-native Electronic Design Automation platform combining the professional capabilities of **Altium Designer** with AI-assisted, collaborative design inspired by **Flux.ai**.

## Feature Overview

| Module | Status | Description |
|---|---|---|
| Schematic Editor | ✅ | Infinite pan/zoom canvas, component library, drag & drop |
| AI Pin Matcher | ✅ | Auto power nets, I2C/SPI/UART/PWM bus matching, visual hints |
| Footprint Library | ✅ | 0805, SOT223, ESP32-WROOM, BME280 footprints with pad data |
| Netlist Generator | ✅ | JSON netlist, ratsnest, schematic↔PCB mode toggle |
| Gerber Export | ✅ | RS-274X Top/Bottom copper + silkscreen + Excellon drill |
| ZIP Packaging | ✅ | JSZip bundle with BOM + Pick-and-Place CSV |
| Contextual Panel | ✅ | Tabbed specs/StackOverflow/GitHub mock data panel |
| Wire/Via/Probe Tools | ✅ | Net-aware routing with ERC conflict detection |
| DRC Engine | ✅ | Electrical + physical rules, flashing violation overlays |
| 3D PCB View | ✅ | Three.js stackup extrusion, traces, vias, component bodies |
| Layer Stackup Manager | ✅ | JSON stackup model with thickness editor UI |
| Symbol Editor | ✅ | 2D primitives + pin placement on grid canvas |
| Footprint Editor | ✅ | SMD/TH pads, courtyard, silkscreen, solder mask expansion |
| Component Packaging | ✅ | exportComponentPackage() → unified JSON asset |
| SPICE Converter | ✅ | JSON netlist → SPICE text format |
| Web Worker Simulation | ✅ | Non-blocking simulation, streaming progress |
| Oscilloscope UI | ✅ | Chart.js voltage/current waveform display |
| Backend API | ✅ | Node/Express + PostgreSQL JSONB schema |
| DB Schema | ✅ | Users, Projects, ComponentLibrary, AuditLog |

## Quick Start

```bash
# Install dependencies
npm install

# Development (frontend)
npm run dev

# Production build
npm run build

# Backend server (requires PostgreSQL)
cp .env.example .env   # configure DATABASE_URL
node backend/server.js
```

## Architecture

```
/
├── index.html                    ← Main schematic/PCB workspace
├── component-editor.html         ← Standalone symbol/footprint editor
├── src/
│   ├── main.js                   ← App entry point, event wiring
│   ├── core/
│   │   ├── dataModels.js         ← All JSON data model factories
│   │   ├── schematicState.js     ← Global state manager (pub/sub)
│   │   ├── canvasRenderer.js     ← 2D Canvas renderer
│   │   ├── componentLibrary.js   ← Built-in component library
│   │   ├── footprintLibrary.js   ← PCB footprint pad data
│   │   └── netlistGenerator.js   ← JSON netlist + ratsnest
│   ├── tools/
│   │   ├── aiPinMatcher.js       ← AI suggestions (power nets, bus matching)
│   │   ├── routingTools.js       ← Wire/Via/Probe tools + ERC
│   │   └── drcEngine.js          ← Design Rule Check engine
│   ├── export/
│   │   ├── gerberGenerator.js    ← RS-274X + Excellon + BOM + CPL
│   │   └── exportPackager.js     ← JSZip bundling
│   ├── ui/
│   │   ├── contextualPanel.js    ← Tabbed resource panel + mock data
│   │   └── threeDView.js         ← Three.js 3D view + layer stackup UI
│   ├── editor/
│   │   └── symbolFootprintEditor.js ← Symbol + Footprint editor
│   └── simulation/
│       ├── spiceConverter.js     ← JSON → SPICE text
│       ├── oscilloscope.js       ← Chart.js oscilloscope
│       └── simulationManager.js  ← Worker coordination
├── workers/
│   └── simulator.worker.js       ← Web Worker SPICE simulation engine
└── backend/
    ├── server.js                 ← Express app
    ├── db/
    │   ├── pool.js               ← pg Pool
    │   └── schema.sql            ← PostgreSQL DDL
    └── routes/
        ├── projects.js           ← Project CRUD + state sync API
        └── components.js         ← Component library API
```

## Key Data Structures

### Component JSON
```json
{
  "id": "C1_ESP32_WROOM",
  "partId": "ESP32_WROOM",
  "x": 50, "y": 30,
  "rotation": 0,
  "pins": [
    { "number": 25, "name": "GPIO21_SDA", "type": "BIDIRECTIONAL", "netId": "NET1" }
  ],
  "footprintId": "ESP32_WROOM_32"
}
```

### Netlist JSON
```json
{
  "nets": {
    "NET1": { "name": "I2C_SDA", "netClass": "I2C", "pinRefs": [
      { "componentId": "C1_ESP32_WROOM", "pinNumber": 25 },
      { "componentId": "C2_BME280",      "pinNumber": 3 }
    ]}
  }
}
```

### Padstack JSON
```json
{
  "type": "SMD",
  "shape": "rect",
  "width": 1.6,
  "height": 0.9,
  "soldermaskExpansion": 0.1,
  "pasteMaskReduction": 0.0,
  "layers": ["F.Cu", "F.Paste", "F.Mask"]
}
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| W | Wire tool |
| V | Via tool |
| P | Probe tool |
| Esc | Cancel / deselect tool |
| Delete | Remove selected component |
| Scroll | Zoom in/out |
| Middle/Right drag | Pan canvas |

## Manufacturing Outputs

Click **Export** in the toolbar to generate and download a ZIP containing:
- `*-F_Cu.gbr` – Top copper (RS-274X)
- `*-B_Cu.gbr` – Bottom copper (RS-274X)
- `*-F_SilkS.gbr` – Front silkscreen (RS-274X)
- `*.drl` – NC drill file (Excellon)
- `*_BOM.csv` – Bill of Materials
- `*_CPL.csv` – Pick-and-Place / Component Position List
