import { applyPromo, knownPromoCodes } from "./promo";

describe("promo codes", () => {
  it("applies a percentage discount", () => {
    expect(applyPromo("LUMEN20", 200)).toMatchObject({ code: "LUMEN20", discount: 40 });
  });

  it("marks free-shipping promos", () => {
    expect(applyPromo("FREESHIP", 120)).toMatchObject({ discount: 0, freeShipping: true });
  });

  it("lists known codes", () => {
    expect(knownPromoCodes()).toContain("FIELD10");
  });
});
