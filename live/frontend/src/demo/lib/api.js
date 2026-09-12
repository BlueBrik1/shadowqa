const API = `${process.env.REACT_APP_BACKEND_URL}/api/demo`;

export function authToken() {
  return localStorage.getItem("lumen:token");
}

/**
 * Thin JSON client for the Lumen storefront API.
 * Returns the parsed JSON body for every response so callers can inspect API-level error envelopes.
 */
export async function request(path, { method = "GET", body, headers = {} } = {}) {
  const token = authToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && path !== "/auth/login") {
    localStorage.removeItem("lumen:token");
    localStorage.removeItem("lumen:user");
    window.dispatchEvent(new Event("lumen:unauthorized"));
  }
  return res.json();
}
