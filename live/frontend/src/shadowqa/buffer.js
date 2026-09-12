/** Bounded ring buffer with subscription — the rolling contextual window around a failure. */
export class RingBuffer {
  constructor(capacity = 120) {
    this.capacity = capacity;
    this.items = [];
    this.listeners = new Set();
  }

  push(item) {
    this.items.push(item);
    if (this.items.length > this.capacity) this.items.shift();
    this.listeners.forEach((fn) => {
      try {
        fn(item);
      } catch {
        /* listeners never break capture */
      }
    });
    return item;
  }

  toArray() {
    return this.items.slice();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

let seq = 0;
export const newId = (prefix) => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
