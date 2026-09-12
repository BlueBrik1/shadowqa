import { request } from "../lib/api";

/**
 * Submit an order to the payment gateway.
 * Resolves with the gateway receipt: { transactionId, orderId, status, amount, currency, createdAt }.
 */
export async function submitPayment({ order, customer, card }) {
  return request("/payment", {
    method: "POST",
    body: {
      total: order.total,
      currency: order.currency,
      items: order.items.map((item) => ({ product_id: item.id, qty: item.qty })),
      customer: {
        name: customer.name,
        email: customer.email,
        address: customer.address,
        city: customer.city,
        postal_code: customer.postal,
      },
      card: { number: card.number, exp: card.exp, cvc: card.cvc },
    },
  });
}
