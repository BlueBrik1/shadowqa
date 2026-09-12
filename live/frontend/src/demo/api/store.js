import { request } from "../lib/api";

export const login = (email, password) => request("/auth/login", { method: "POST", body: { email, password } });
export const fetchProducts = () => request("/products");
export const fetchProduct = (id) => request(`/products/${id}`);
export const fetchDashboard = () => request("/dashboard");
export const fetchOrders = () => request("/orders");
export const fetchOrder = (id) => request(`/orders/${id}`);
/** Shipment tracking for an order: { carrier, tracking_number, status, eta, events[] }. */
export const fetchTracking = (id) => request(`/orders/${id}/tracking`).then((data) => data.tracking);
export const fetchSettings = () => request("/settings");
export const saveSettings = (preferences) => request("/settings", { method: "PUT", body: preferences });
export const fetchAccount = () => request("/account").then((data) => data.account);
export const saveAccount = (account) => request("/account", { method: "PUT", body: account });
export const fetchFaq = () => request("/help/faq");
export const submitSupport = (body) => request("/support", { method: "POST", body });
export const fetchTickets = () => request("/support/tickets");
