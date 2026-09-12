import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAccount, fetchOrders, saveAccount } from "../api/store";
import { Field, PageHeader } from "../components/Field";
import { formatMoney } from "../lib/money";

const EMPTY = { name: "", company: "", phone: "", address: "", city: "", postal_code: "" };

export default function Account() {
  const [account, setAccount] = useState(null);
  const [orders, setOrders] = useState([]);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchAccount().then((a) => setAccount({ ...EMPTY, ...a }));
    fetchOrders().then((d) => setOrders(d.orders || []));
  }, []);

  const update = (e) => setAccount((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { name, company, phone, address, city, postal_code } = account;
      const res = await saveAccount({ name, company, phone, address, city, postal_code });
      setSaved(res.saved_at);
      setTimeout(() => setSaved(null), 2500);
    } finally {
      setBusy(false);
    }
  };

  if (!account) return <div className="text-sm text-mute font-mono">Loading…</div>;
  const spend = orders.reduce((s, o) => s + o.amount, 0);

  return (
    <div data-testid="account-page">
      <PageHeader eyebrow="Your account" title={<>Profile &amp; <span className="italic font-light">shipping</span></>} />
      <div className="grid lg:grid-cols-5 gap-10">
        <form onSubmit={save} className="lg:col-span-3 bg-white border border-line p-6 space-y-6 reveal" data-testid="account-form">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Full name" id="acc-name" name="name" testid="account-name" value={account.name} onChange={update} required />
            <Field label="Company (optional)" id="acc-company" name="company" testid="account-company" value={account.company} onChange={update} />
            <Field label="Phone" id="acc-phone" name="phone" testid="account-phone" value={account.phone} onChange={update} placeholder="+1 541 555 0148" autoComplete="tel" />
            <Field label="Email" id="acc-email" name="email" testid="account-email" value={account.email} readOnly hint="sign-in email, managed by Lumen" />
          </div>
          <div>
            <div className="eyebrow mb-3">Default shipping address</div>
            <div className="grid sm:grid-cols-6 gap-4">
              <div className="sm:col-span-6"><Field label="Street address" id="acc-address" name="address" testid="account-address" value={account.address} onChange={update} autoComplete="street-address" /></div>
              <div className="sm:col-span-4"><Field label="City" id="acc-city" name="city" testid="account-city" value={account.city} onChange={update} /></div>
              <div className="sm:col-span-2"><Field label="Postal code" id="acc-postal" name="postal_code" testid="account-postal" value={account.postal_code} onChange={update} /></div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button type="submit" className="btn-ink" disabled={busy} data-testid="account-save-btn">{busy ? "Saving…" : "Save profile"}</button>
            {saved && <span className="text-sm text-forest font-mono" data-testid="account-saved">Saved</span>}
          </div>
        </form>
        <aside className="lg:col-span-2 space-y-6 reveal reveal-1">
          <div className="bg-white border border-line p-6" data-testid="account-summary">
            <div className="eyebrow mb-4">Membership</div>
            <dl className="space-y-3 text-sm">
              <div><dt className="text-ink2 text-xs">Member since</dt><dd className="text-ink">{account.member_since ? new Date(account.member_since).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—"}</dd></div>
              <div><dt className="text-ink2 text-xs">Orders</dt><dd className="text-ink stat-num" data-testid="account-order-count">{orders.length}</dd></div>
              <div><dt className="text-ink2 text-xs">Lifetime spend</dt><dd className="text-ink stat-num">{formatMoney(spend)}</dd></div>
            </dl>
          </div>
          <div className="bg-white border border-line p-6">
            <div className="eyebrow mb-4">Shortcuts</div>
            <div className="grid gap-2 text-sm">
              <Link to="/orders" className="text-ink hover:underline" data-testid="account-orders-link">Order history →</Link>
              <Link to="/wishlist" className="text-ink hover:underline" data-testid="account-wishlist-link">Wishlist →</Link>
              <Link to="/settings" className="text-ink hover:underline" data-testid="account-settings-link">Notification preferences →</Link>
              <Link to="/help" className="text-ink hover:underline" data-testid="account-help-link">Help &amp; support →</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
