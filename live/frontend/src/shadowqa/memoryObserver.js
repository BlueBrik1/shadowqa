/** Learns the application shape over time (routes, APIs, components) with a tiny batched heartbeat. */
export class MemoryObserver {
  constructor(bridge) {
    this.bridge = bridge;
    this.routes = new Map();
    this.apis = new Map();
    this.components = new Map();
    this.timer = null;
  }

  noteRoute(path) {
    const e = this.routes.get(path) || { path, count: 0 };
    e.count++;
    e.title = document.title;
    this.routes.set(path, e);
  }

  noteNetwork(item) {
    if (!item.path || !item.end_ts) return;
    const key = `${item.method} ${item.path} ${item.status}`;
    const e = this.apis.get(key) || { method: item.method, path: item.path.replace(/\/[0-9a-f-]{8,}|\/LUM-\d+/gi, "/:id"), status: item.status, count: 0 };
    e.count++;
    this.apis.set(key, e);
  }

  noteInteraction(item) {
    const name = item.target?.component;
    if (!name) return;
    const e = this.components.get(name) || { name, count: 0, route: item.route };
    e.count++;
    this.components.set(name, e);
  }

  start() {
    // Heartbeat only — never flush on unload/hide, so no aborted requests appear in the network log. The runtime flushes explicitly before its own reloads.
    this.timer = setInterval(() => this.flush(), 20000);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  async flush() {
    if (!this.routes.size && !this.apis.size && !this.components.size) return;
    const payload = { routes: [...this.routes.values()], apis: [...this.apis.values()], components: [...this.components.values()] };
    this.routes.clear();
    this.apis.clear();
    this.components.clear();
    try {
      await this.bridge.observe(payload);
    } catch {
      /* memory is best-effort */
    }
  }
}
