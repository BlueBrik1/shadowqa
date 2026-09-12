const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatMoney(value) {
  return formatter.format(Number(value) || 0);
}

export function subtotalOf(items) {
  return Math.round(items.reduce((sum, item) => sum + item.price * item.qty, 0) * 100) / 100;
}

export function shippingFor(subtotal, freeShipping = false) {
  if (freeShipping || subtotal >= 300 || subtotal === 0) return 0;
  return 18;
}
