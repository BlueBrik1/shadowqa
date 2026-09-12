import { submitPayment } from "./payments";

describe("submitPayment", () => {
  const order = { total: 285, currency: "USD", items: [{ id: "lum-01", qty: 1, price: 285 }] };
  const customer = { name: "Ada", email: "ada@lumen.supply", address: "1 Ridge Rd", city: "Bend", postal: "97701" };
  const card = { number: "4242 4242 4242 4242", exp: "12/28", cvc: "123" };

  beforeEach(() => {
    process.env.REACT_APP_BACKEND_URL = "http://test.local";
    global.fetch = jest.fn(() =>
      Promise.resolve({ status: 200, ok: true, json: () => Promise.resolve({ transactionId: "txn_1", orderId: "LUM-1", status: "succeeded" }) }),
    );
  });

  it("POSTs a JSON payment to the gateway endpoint and resolves the receipt", async () => {
    const receipt = await submitPayment({ order, customer, card });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toMatch(/\/payment$/);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.items).toEqual([{ product_id: "lum-01", qty: 1 }]);
    expect(body.customer.postal_code).toBe("97701");
    expect(receipt.transactionId).toBe("txn_1");
  });
});
