/**
 * AltiEDA – 3D PCB Visualization (Three.js)
 *
 * generate3DBoard(stackupData, pcbOutline, traces)
 * toggle2D3D(mode, renderer, threeContainer)
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { state }         from '../core/schematicState.js';
import { defaultStackup } from '../core/dataModels.js';
import { FOOTPRINT_MAP }  from '../core/footprintLibrary.js';
import { generateNetlist, buildRatsnest } from '../core/netlistGenerator.js';

// Colour map for layer types
const LAYER_COLORS = {
  copper:      0xc87533,
  silkscreen:  0xffffff,
  mask:        0x004400,
  dielectric:  0xd4c000,
};

export class ThreeDView {
  constructor(container) {
    this.container = container;
    this.scene     = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d0d1a);

    const w = container.clientWidth  || 800;
    const h = container.clientHeight || 600;
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 10000);
    this.camera.position.set(60, 60, 80);

    this.renderer3d = new THREE.WebGLRenderer({ antialias: true });
    this.renderer3d.setSize(w, h);
    this.renderer3d.shadowMap.enabled = true;
    container.appendChild(this.renderer3d.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer3d.domElement);
    this.controls.enableDamping = true;

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(50, 80, 50);
    sun.castShadow = true;
    this.scene.add(sun);

    this._animate();
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer3d.render(this.scene, this.camera);
  }

  // ── Generate full 3D board ────────────────────────────────────────────────
  generate3DBoard(stackupData = defaultStackup, pcbOutline = null, traces = []) {
    // Clear existing meshes
    while (this.scene.children.length > 0) {
      const obj = this.scene.children[0];
      if (obj.isMesh) obj.geometry.dispose();
      this.scene.remove(obj);
    }

    const board = state.pcb.board;
    const outline = pcbOutline ?? [
      new THREE.Vector2(board.x, board.y),
      new THREE.Vector2(board.x + board.width, board.y),
      new THREE.Vector2(board.x + board.width, board.y + board.height),
      new THREE.Vector2(board.x, board.y + board.height),
    ];

    const shape = new THREE.Shape(outline);
    let currentZ = 0;

    // Extrude each layer
    for (const layer of stackupData.layers) {
      const mat = new THREE.MeshStandardMaterial({
        color: LAYER_COLORS[layer.type] ?? 0x888888,
        transparent: layer.type === 'mask',
        opacity:     layer.type === 'mask' ? 0.7 : 1.0,
        roughness:   layer.type === 'copper' ? 0.2 : 0.8,
        metalness:   layer.type === 'copper' ? 0.8 : 0.0,
      });
      const geo  = new THREE.ExtrudeGeometry(shape, {
        depth:          layer.thickness,
        bevelEnabled:   false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = currentZ;
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      mesh.userData.layerId = layer.id;
      this.scene.add(mesh);
      currentZ += layer.thickness;
    }

    // Traces (copper)
    this._drawTraces3D(traces, stackupData, currentZ);

    // Vias
    this._drawVias3D(stackupData, currentZ);

    // Components
    this._drawComponents3D(currentZ);

    // Lighting re-add
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(50, 80, 50);
    sun.castShadow = true;
    this.scene.add(sun);

    // Center camera
    this.camera.position.set(
      board.width / 2, board.height / 2,
      Math.max(board.width, board.height) * 1.5
    );
    this.camera.lookAt(board.width / 2, board.height / 2, 0);
  }

  _drawTraces3D(traces, stackupData, totalZ) {
    const copperZ = this._layerZ('F.Cu', stackupData, totalZ);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc87533, metalness: 0.8, roughness: 0.2 });

    const pcbTraces = traces.length ? traces : Object.values(state.pcb.traces);
    for (const trace of pcbTraces) {
      const dx   = trace.x2 - trace.x1;
      const dy   = trace.y2 - trace.y1;
      const len  = Math.hypot(dx, dy);
      if (len < 0.01) continue;

      const geo  = new THREE.BoxGeometry(len, trace.width || 0.2, 0.035);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (trace.x1 + trace.x2) / 2,
        (trace.y1 + trace.y2) / 2,
        copperZ + 0.017
      );
      mesh.rotation.z = Math.atan2(dy, dx);
      this.scene.add(mesh);
    }
  }

  _drawVias3D(stackupData, totalZ) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xc87533, metalness: 0.7, roughness: 0.3 });
    for (const via of Object.values(state.pcb.vias)) {
      const geo  = new THREE.CylinderGeometry(via.padDiameter / 2, via.padDiameter / 2, totalZ, 16);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(via.x, via.y, totalZ / 2);
      mesh.rotation.x = Math.PI / 2;
      this.scene.add(mesh);

      // Drill hole (hollow barrel)
      const hole = new THREE.CylinderGeometry(via.drillDiameter / 2, via.drillDiameter / 2, totalZ + 0.1, 12);
      const holeMesh = new THREE.Mesh(hole, new THREE.MeshStandardMaterial({ color: 0x0d0d1a }));
      holeMesh.position.set(via.x, via.y, totalZ / 2);
      holeMesh.rotation.x = Math.PI / 2;
      this.scene.add(holeMesh);
    }
  }

  _drawComponents3D(totalZ) {
    const mm = 1;  // world unit = mm for 3D
    for (const pcbComp of Object.values(state.pcb.components)) {
      const fp = FOOTPRINT_MAP[pcbComp.footprintId];
      if (!fp) continue;
      const b = fp.body3d;

      // Use per-component material properties from footprint data
      const matProps = {
        color:     b.color ?? 0x1a1a2e,
        roughness: b.roughness ?? 0.7,
        metalness: b.metalness ?? 0.1,
      };
      if (b.emissive != null) {
        matProps.emissive = b.emissive;
        matProps.emissiveIntensity = b.emissiveIntensity ?? 0.5;
      }
      const mat = new THREE.MeshStandardMaterial(matProps);

      // Use cylinder for round packages (buzzers, etc.)
      let geo;
      if (b.shape === 'cylinder') {
        geo = new THREE.CylinderGeometry(b.width / 2 * mm, b.width / 2 * mm, b.depth * mm, 32);
      } else {
        geo = new THREE.BoxGeometry(b.width * mm, b.height * mm, b.depth * mm);
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        pcbComp.x * mm,
        pcbComp.y * mm,
        totalZ + (b.depth / 2) + (b.offsetZ ?? 0)
      );
      if (b.shape === 'cylinder') {
        mesh.rotation.x = Math.PI / 2; // stand upright
      }
      mesh.castShadow    = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      // Render metal tab for TO-220 packages
      if (b.tabColor != null) {
        const tabMat = new THREE.MeshStandardMaterial({
          color: b.tabColor, metalness: 0.8, roughness: 0.3,
        });
        const tabGeo = new THREE.BoxGeometry(b.width * mm, 0.5, (b.depth - 2) * mm);
        const tabMesh = new THREE.Mesh(tabGeo, tabMat);
        tabMesh.position.set(
          pcbComp.x * mm,
          pcbComp.y * mm - b.height / 2 * mm - 0.25,
          totalZ + (b.depth / 2) + (b.offsetZ ?? 0)
        );
        tabMesh.castShadow = true;
        this.scene.add(tabMesh);
      }

      // Render cap/button accent (e.g. tactile switch)
      if (b.capColor != null) {
        const capMat = new THREE.MeshStandardMaterial({
          color: b.capColor, roughness: 0.5,
        });
        const capSize = Math.min(b.width, b.height) * 0.45;
        const capGeo = new THREE.CylinderGeometry(capSize * mm, capSize * mm, 1.5, 16);
        const capMesh = new THREE.Mesh(capGeo, capMat);
        capMesh.position.set(
          pcbComp.x * mm,
          pcbComp.y * mm,
          totalZ + b.depth + 0.75 + (b.offsetZ ?? 0)
        );
        capMesh.rotation.x = Math.PI / 2;
        this.scene.add(capMesh);
      }

      // Render screen area for display modules
      if (b.screenColor != null) {
        const screenMat = new THREE.MeshStandardMaterial({
          color: b.screenColor, emissive: b.screenColor,
          emissiveIntensity: 0.3, roughness: 0.9,
        });
        const sw = b.width * 0.8, sh = b.height * 0.6;
        const screenGeo = new THREE.BoxGeometry(sw * mm, sh * mm, 0.1);
        const screenMesh = new THREE.Mesh(screenGeo, screenMat);
        screenMesh.position.set(
          pcbComp.x * mm,
          pcbComp.y * mm,
          totalZ + b.depth + 0.05 + (b.offsetZ ?? 0)
        );
        this.scene.add(screenMesh);
      }

      // Render RF shield for modules (ESP32, ESP8266)
      if (b.shieldColor != null) {
        const shieldMat = new THREE.MeshStandardMaterial({
          color: b.shieldColor, metalness: 0.7, roughness: 0.3,
        });
        const sw = b.width * 0.55, sh = b.height * 0.5;
        const shieldGeo = new THREE.BoxGeometry(sw * mm, sh * mm, (b.depth + 0.2) * mm);
        const shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
        shieldMesh.position.set(
          pcbComp.x * mm,
          pcbComp.y * mm - b.height * 0.15,
          totalZ + (b.depth / 2) + (b.offsetZ ?? 0)
        );
        shieldMesh.castShadow = true;
        this.scene.add(shieldMesh);
      }

      // Render gold pins for connectors
      if (b.pinColor != null && fp.pads) {
        const pinMat = new THREE.MeshStandardMaterial({
          color: b.pinColor, metalness: 0.9, roughness: 0.2,
        });
        for (const pad of fp.pads) {
          const pinGeo = new THREE.BoxGeometry(0.64, 0.64, b.depth * mm);
          const pinMesh = new THREE.Mesh(pinGeo, pinMat);
          pinMesh.position.set(
            (pcbComp.x + pad.x) * mm,
            (pcbComp.y + pad.y) * mm,
            totalZ + (b.depth / 2) + (b.offsetZ ?? 0)
          );
          this.scene.add(pinMesh);
        }
      }
    }
  }

  _layerZ(layerId, stackup, totalZ) {
    let z = 0;
    for (const layer of stackup.layers) {
      if (layer.id === layerId) return z;
      z += layer.thickness;
    }
    return z;
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer3d.setSize(w, h);
  }

  dispose() {
    this.renderer3d.dispose();
  }
}

// ── 2D ↔ 3D Context Switcher ─────────────────────────────────────────────────
let _threeDView = null;

export function toggle2D3DView(targetMode, canvasEl, threeContainer) {
  if (targetMode === '3d') {
    // Ensure PCB state is populated from schematic before 3D render
    _ensurePCBState();

    canvasEl.style.display = 'none';
    threeContainer.style.display = 'block';
    if (!_threeDView) {
      _threeDView = new ThreeDView(threeContainer);
    }
    _threeDView.generate3DBoard();
    state.mode = '3d';
  } else {
    canvasEl.style.display = 'block';
    threeContainer.style.display = 'none';
    // Only restore mode when coming back from 3D view; don't override schematic/pcb
    if (state.mode === '3d') {
      state.mode = Object.keys(state.pcb.components).length > 0 ? 'pcb' : 'schematic';
    }
  }
}

/** Populate state.pcb from schematic if empty, so 3D view has data */
function _ensurePCBState() {
  // Place components
  for (const comp of Object.values(state.schematic.components)) {
    if (!state.pcb.components[comp.id]) {
      state.pcb.components[comp.id] = {
        id:          comp.id,
        footprintId: comp.footprintId,
        x:           comp.x,
        y:           comp.y,
        rotation:    comp.rotation,
        layer:       'F.Cu',
      };
    }
  }

  // Convert wires to traces
  if (Object.keys(state.pcb.traces).length === 0) {
    for (const wire of Object.values(state.schematic.wires)) {
      const traceId = 'trace_' + wire.id;
      state.pcb.traces[traceId] = {
        id:    traceId,
        x1:    wire.x1,
        y1:    wire.y1,
        x2:    wire.x2,
        y2:    wire.y2,
        layer: wire.layer || 'F.Cu',
        width: 0.25,
        netId: wire.netId ?? null,
      };
    }
  }

  // Auto-size board to fit components
  const comps = Object.values(state.pcb.components);
  if (comps.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of comps) {
      const fp = FOOTPRINT_MAP[c.footprintId];
      const margin = fp ? Math.max(fp.body3d.width, fp.body3d.height) / 2 + 5 : 10;
      minX = Math.min(minX, c.x - margin);
      minY = Math.min(minY, c.y - margin);
      maxX = Math.max(maxX, c.x + margin);
      maxY = Math.max(maxY, c.y + margin);
    }
    state.pcb.board = {
      x: minX,
      y: minY,
      width:  maxX - minX,
      height: maxY - minY,
    };
  }
}

// ── Layer Stackup UI ──────────────────────────────────────────────────────────
export function renderLayerStackupUI(stackup = defaultStackup) {
  const container = document.getElementById('layer-stackup-ui');
  if (!container) return;

  let html = '';
  for (const layer of stackup.layers) {
    const color = LAYER_COLORS[layer.type]
      ? '#' + LAYER_COLORS[layer.type].toString(16).padStart(6, '0')
      : '#888';
    html += `
      <div class="layer-row">
        <div class="layer-swatch" style="background:${color}"></div>
        <span class="layer-name">${layer.name}</span>
        <span style="color:#666;font-size:10px">${layer.type}</span>
        <input class="layer-thickness" type="number" step="0.001" min="0"
               value="${layer.thickness}" data-layer="${layer.id}"
               title="Thickness (mm)" /> mm
      </div>`;
  }
  container.innerHTML = html;

  // Bind thickness inputs
  container.querySelectorAll('.layer-thickness').forEach(input => {
    input.addEventListener('change', e => {
      const layerId = e.target.dataset.layer;
      const layer   = stackup.layers.find(l => l.id === layerId);
      if (layer) layer.thickness = parseFloat(e.target.value) || layer.thickness;
    });
  });
}
