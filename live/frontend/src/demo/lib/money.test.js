import { formatMoney, shippingFor, subtotalOf } from "./money";

describe("money helpers", () => {
  it("formats USD", () => {
    expect(formatMoney(285)).toBe("$285.00");
    expect(formatMoney("12.5")).toBe("$12.50");
  });

  it("computes subtotal", () => {
    expect(subtotalOf([{ price: 120, qty: 2 }, { price: 19.99, qty: 1 }])).toBe(259.99);
  });

  it("applies free shipping over $300", () => {
    expect(shippingFor(120)).toBe(18);
    expect(shippingFor(340)).toBe(0);
    expect(shippingFor(120, true)).toBe(0);
  });
});
