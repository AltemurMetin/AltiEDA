/**
 * AltiEDA – Schematic & PCB State Manager (singleton)
 */
import {
  createSchematicState,
  createPCBState,
  createNet,
  NetClass,
} from './dataModels.js';

class StateManager {
  constructor() {
    this.schematic = createSchematicState();
    this.pcb       = createPCBState();
    this.mode      = 'schematic'; // 'schematic' | 'pcb' | '3d' | 'simulation'
    this._listeners = [];
  }

  subscribe(fn) { this._listeners.push(fn); }
  _emit(event, payload) { this._listeners.forEach(fn => fn(event, payload)); }

  // ── Component management ──────────────────────────────────────────────────
  addComponent(comp) {
    this.schematic.components[comp.id] = comp;
    this._emit('component:add', comp);
    return comp;
  }

  removeComponent(id) {
    const comp = this.schematic.components[id];
    if (!comp) return;
    // Remove pin-to-net bindings
    comp.pins.forEach(pin => {
      if (pin.netId) this.removePinFromNet(id, pin.number);
    });
    delete this.schematic.components[id];
    this._emit('component:remove', id);
  }

  updateComponent(id, patch) {
    const comp = this.schematic.components[id];
    if (!comp) return;
    Object.assign(comp, patch);
    this._emit('component:update', { id, patch });
  }

  // ── Net management ────────────────────────────────────────────────────────
  getOrCreateNet(name, netClass = NetClass.SIGNAL) {
    const existing = Object.values(this.schematic.nets)
      .find(n => n.name === name);
    if (existing) return existing;
    const net = createNet(name, netClass);
    this.schematic.nets[net.id] = net;
    this._emit('net:create', net);
    return net;
  }

  assignPinToNet(componentId, pinNumber, netId) {
    const comp = this.schematic.components[componentId];
    const net  = this.schematic.nets[netId];
    if (!comp || !net) return;
    const pin = comp.pins.find(p => p.number === pinNumber);
    if (!pin) return;
    pin.netId    = netId;
    pin.connected = true;
    if (!net.pinRefs.find(r => r.componentId === componentId && r.pinNumber === pinNumber)) {
      net.pinRefs.push({ componentId, pinNumber });
    }
    this._emit('pin:assign', { componentId, pinNumber, netId });
  }

  removePinFromNet(componentId, pinNumber) {
    const comp = this.schematic.components[componentId];
    if (!comp) return;
    const pin = comp.pins.find(p => p.number === pinNumber);
    if (!pin || !pin.netId) return;
    const net = this.schematic.nets[pin.netId];
    if (net) {
      net.pinRefs = net.pinRefs.filter(
        r => !(r.componentId === componentId && r.pinNumber === pinNumber)
      );
    }
    pin.netId     = null;
    pin.connected = false;
  }

  // ── Wire management ───────────────────────────────────────────────────────
  addWire(wire) {
    this.schematic.wires[wire.id] = wire;
    this._emit('wire:add', wire);
    return wire;
  }

  removeWire(id) {
    const wire = this.schematic.wires[id];
    if (!wire) return;
    const net = this.schematic.nets[wire.netId];
    if (net) net.wireIds = (net.wireIds ?? []).filter(w => w !== id);
    delete this.schematic.wires[id];
    this._emit('wire:remove', wire);
  }

  // ── Via management ────────────────────────────────────────────────────────
  addVia(via) {
    this.pcb.vias[via.id] = via;
    this._emit('via:add', via);
    return via;
  }

  removeVia(id) {
    const via = this.pcb.vias[id];
    if (!via) return;
    delete this.pcb.vias[id];
    this._emit('via:remove', via);
  }

  // ── Probe management ──────────────────────────────────────────────────────
  addProbe(probe) {
    this.schematic.probes[probe.id] = probe;
    this._emit('probe:add', probe);
    return probe;
  }

  // ── Serialization ─────────────────────────────────────────────────────────
  toJSON() {
    return JSON.stringify({
      schematic: this.schematic,
      pcb:       this.pcb,
      mode:      this.mode,
    }, null, 2);
  }

  fromJSON(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    this.schematic = data.schematic;
    this.pcb       = data.pcb;
    this.mode      = data.mode ?? 'schematic';
    this._emit('state:load', null);
  }
}

export const state = new StateManager();
