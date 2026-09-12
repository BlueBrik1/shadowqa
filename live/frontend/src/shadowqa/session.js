const KEY = "shadowqa:session";

/** Per-tab session (sessionStorage): survives the hot reload before replay, never leaks to other tabs, never leaves the browser. */
export const session = {
  load() {
    try {
      return JSON.parse(sessionStorage.getItem(KEY)) || null;
    } catch {
      return null;
    }
  },
  save(state) {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable */
    }
  },
  patch(fields) {
    this.save({ ...(this.load() || {}), ...fields });
  },
  clear() {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
