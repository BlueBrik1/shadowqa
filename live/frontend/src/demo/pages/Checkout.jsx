import { useState } from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { submitPayment } from "../api/payments";
import { formatMoney, shippingFor } from "../lib/money";
import { Field, PageHeader } from "../components/Field";
import { useAuth } from "../store/AuthContext";
import { useCart } from "../store/CartContext";

export default function Checkout() {
  const { user } = useAuth();
  const { items, subtotal, clear } = useCart();
  const [customer, setCustomer] = useState({ name: user?.name || "", email: user?.email || "", address: "", city: "", postal: "" });
  const [card, setCard] = useState({ number: "", exp: "", cvc: "" });
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const shipping = shippingFor(subtotal);
  const total = Math.round((subtotal + shipping) * 100) / 100;
  const update = (setter) => (e) => setter((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handlePay = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await submitPayment({
        order: { items, total, currency: "USD" },
        customer,
        card,
      });
      setReceipt({ reference: result.transactionId.toUpperCase(), orderId: result.orderId, amount: result.amount });
      clear();
    } finally {
      setBusy(false);
    }
  };

  if (receipt) {
    return (
      <div className="max-w-xl mx-auto bg-white border border-line p-10 text-center reveal" data-testid="order-confirmation">
        <div className="eyebrow mb-3">Order confirmed</div>
        <h1 className="font-display text-4xl text-ink tracking-tight">Thank you, {customer.name.split(" ")[0]}.</h1>
        <p className="mt-4 text-ink2">
          Order <span className="font-mono text-ink" data-testid="confirmation-order-id">{receipt.orderId}</span> · {formatMoney(receipt.amount)}
        </p>
        <p className="mt-1 text-xs font-mono text-mute" data-testid="confirmation-reference">ref {receipt.reference}</p>
        <Link to="/orders" className="btn-ink mt-8" data-testid="confirmation-view-orders">View orders</Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white border border-line p-12 text-center" data-testid="checkout-empty">
        <p className="text-ink2">Nothing to check out yet.</p>
        <Link to="/products" className="btn-ghost mt-6">Browse the catalog</Link>
      </div>
    );
  }

  return (
    <div data-testid="checkout-page">
      <PageHeader eyebrow="Secure checkout" title={<>Complete your <span className="italic font-light">order</span></>} />
      <form onSubmit={handlePay} className="grid lg:grid-cols-5 gap-10" data-testid="checkout-form">
        <div className="lg:col-span-3 space-y-8 reveal">
          <section className="bg-white border border-line p-6">
            <h2 className="font-display text-lg text-ink mb-5">Contact</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full name" id="name" name="name" testid="checkout-name" value={customer.name} onChange={update(setCustomer)} required autoComplete="name" />
              <Field label="Email" id="email" name="email" type="email" testid="checkout-email" value={customer.email} onChange={update(setCustomer)} required autoComplete="email" />
            </div>
          </section>
          <section className="bg-white border border-line p-6">
            <h2 className="font-display text-lg text-ink mb-5">Shipping</h2>
            <div className="grid sm:grid-cols-6 gap-4">
              <div className="sm:col-span-6"><Field label="Street address" id="address" name="address" testid="checkout-address" value={customer.address} onChange={update(setCustomer)} required autoComplete="street-address" /></div>
              <div className="sm:col-span-4"><Field label="City" id="city" name="city" testid="checkout-city" value={customer.city} onChange={update(setCustomer)} required autoComplete="address-level2" /></div>
              <div className="sm:col-span-2"><Field label="Postal code" id="postal" name="postal" testid="checkout-postal" value={customer.postal} onChange={update(setCustomer)} required autoComplete="postal-code" /></div>
            </div>
          </section>
          <section className="bg-white border border-line p-6">
            <h2 className="font-display text-lg text-ink mb-5 flex items-center gap-2">Payment <Lock size={14} className="text-mute" /></h2>
            <div className="grid sm:grid-cols-6 gap-4">
              <div className="sm:col-span-6"><Field label="Card number" id="card-number" name="number" testid="checkout-card-number" value={card.number} onChange={update(setCard)} required inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" hint="test card: 4242 4242 4242 4242" /></div>
              <div className="sm:col-span-3"><Field label="Expiry" id="card-exp" name="exp" testid="checkout-card-exp" value={card.exp} onChange={update(setCard)} required placeholder="MM/YY" autoComplete="cc-exp" /></div>
              <div className="sm:col-span-3"><Field label="CVC" id="card-cvc" name="cvc" testid="checkout-card-cvc" value={card.cvc} onChange={update(setCard)} required inputMode="numeric" autoComplete="cc-csc" placeholder="123" /></div>
            </div>
          </section>
        </div>
        <aside className="lg:col-span-2 reveal reveal-1">
          <div className="bg-white border border-line p-6 sticky top-24">
            <h2 className="font-display text-lg text-ink mb-5">Order summary</h2>
            <ul className="divide-y divide-line" data-testid="checkout-items">
              {items.map((item) => (
                <li key={item.id} className="py-3 flex justify-between gap-4 text-sm">
                  <span className="text-ink2">{item.qty} × {item.name}</span>
                  <span className="stat-num">{formatMoney(item.price * item.qty)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 text-sm border-t border-line pt-4">
              <div className="flex justify-between"><dt className="text-ink2">Subtotal</dt><dd className="stat-num">{formatMoney(subtotal)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink2">Shipping</dt><dd className="stat-num">{shipping === 0 ? "Free" : formatMoney(shipping)}</dd></div>
              <div className="flex justify-between text-base pt-2"><dt className="font-medium">Total</dt><dd className="stat-num font-medium" data-testid="checkout-total">{formatMoney(total)}</dd></div>
            </dl>
            <button type="submit" className="btn-ink w-full mt-6" disabled={busy} data-testid="checkout-pay-btn">
              {busy ? "Processing…" : `Pay ${formatMoney(total)}`}
            </button>
            <p className="mt-3 text-[11px] text-mute font-mono">Payments are processed by the Lumen gateway sandbox.</p>
          </div>
        </aside>
      </form>
    </div>
  );
}
