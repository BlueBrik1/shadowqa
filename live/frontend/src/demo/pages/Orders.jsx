import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { fetchOrders } from "../api/store";
import { formatMoney } from "../lib/money";
import { PageHeader, StatusPill } from "../components/Field";

export default function Orders() {
  const [orders, setOrders] = useState(null);

  useEffect(() => {
    fetchOrders().then((d) => setOrders(d.orders || []));
  }, []);

  return (
    <div data-testid="orders-page">
      <PageHeader eyebrow="Order history" title={<>Your <span className="italic font-light">orders</span></>}>
        <Link to="/help" className="btn-ghost" data-testid="orders-help-link">Need help with an order? <ArrowUpRight size={16} /></Link>
      </PageHeader>
      <div className="bg-white border border-line divide-y divide-line reveal" data-testid="orders-list">
        {orders === null && <div className="p-6 text-sm text-mute font-mono">Loading…</div>}
        {orders?.map((o) => (
          <Link
            key={o.id}
            to={`/orders/${o.id}`}
            data-testid={`order-link-${o.id}`}
            className="p-6 grid sm:grid-cols-[1fr_auto_auto_auto] gap-4 items-center transition-colors duration-200 hover:bg-surface/60"
          >
            <div data-testid={`order-${o.id}`}>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-ink">{o.id}</span>
                <span className="text-xs text-mute">{new Date(o.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
              </div>
              <ul className="mt-2 text-sm text-ink2 space-y-0.5">
                {o.items.map((i) => (
                  <li key={i.product_id}>{i.qty} × {i.name}</li>
                ))}
              </ul>
            </div>
            <StatusPill status={o.status} />
            <span className="stat-num text-sm text-ink">{formatMoney(o.amount)}</span>
            <ArrowUpRight size={16} className="text-mute hidden sm:block" />
          </Link>
        ))}
        {orders?.length === 0 && <div className="p-8 text-sm text-mute">No orders yet.</div>}
      </div>
    </div>
  );
}
