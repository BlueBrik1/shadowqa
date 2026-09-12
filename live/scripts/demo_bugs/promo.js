/**
 * Promotional codes. Codes are case-insensitive for customers ("lumen20" and "LUMEN20" are the same code).
 */
const PROMOS = {
  LUMEN20: { rate: 0.2, label: "20% off — Lumen insiders" },
  FIELD10: { rate: 0.1, label: "10% off — Field notes" },
  FREESHIP: { rate: 0, label: "Free shipping", freeShipping: true },
};

export function applyPromo(code, subtotal) {
  const promo = PROMOS[code.trim()];
  const discount = Math.round(subtotal * promo.rate * 100) / 100;
  return { code: code.trim().toUpperCase(), label: promo.label, discount, freeShipping: Boolean(promo.freeShipping) };
}

export function knownPromoCodes() {
  return Object.keys(PROMOS);
}
