import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, LifeBuoy, RotateCcw, Truck } from "lucide-react";
import { fetchOrder, fetchProducts, fetchTracking } from "../api/store";
import { formatMoney } from "../lib/money";
import { StatusPill } from "../components/Field";
import { useCart } from "../store/CartContext";

const fmtDate = (iso, opts = { month: "short", day: "numeric", year: "numeric" }) => new Date(iso).toLocaleDateString("en-US", opts);
const fmtTime = (iso) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function TrackingTimeline({ tracking }) {
  return (
    <div className="mt-6 border-t border-line pt-6" data-testid="order-tracking">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="eyebrow">{tracking.carrier}</div>
          <div className="font-mono text-sm text-ink mt-1" data-testid="order-tracking-number">{tracking.tracking_number}</div>
        </div>
        <div className="text-xs font-mono text-ink2">{tracking.eta ? `ETA ${fmtDate(tracking.eta, { weekday: "short", month: "short", day: "numeric" })}` : "Delivered"}</div>
      </div>
      <ol className="mt-5 relative border-l border-line ml-1.5 space-y-4" data-testid="order-tracking-events">
        {tracking.events.map((e, i) => {
          const latest = i === tracking.events.length - 1;
          return (
            <li key={e.at} className="pl-5 relative">
              <span className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border ${latest ? "bg-amber border-amber" : "bg-white border-ink/40"}`} />
              <div className={`text-sm ${latest ? "text-ink font-medium" : "text-ink2"}`}>{e.label}</div>
              <div className="text-xs text-mute font-mono mt-0.5">{fmtTime(e.at)} · {e.location}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const { add } = useCart();
  const [order, setOrder] = useState(null);
  const [images, setImages] = useState({});
  const [tracking, setTracking] = useState(null);
  const [trackBusy, setTrackBusy] = useState(false);
  const [reordered, setReordered] = useState(false);

  useEffect(() => {
    setOrder(null);
    setTracking(null);
    fetchOrder(id).then(setOrder);
    fetchProducts().then((d) => setImages(Object.fromEntries((d.products || []).map((p) => [p.id, p.image]))));
  }, [id]);

  const handleTrack = async () => {
    setTrackBusy(true);
    try {
      const t = await fetchTracking(order.id);
      setTracking({ ...t, latest: t.events[t.events.length - 1] });
    } finally {
      setTrackBusy(false);
    }
  };

  const reorder = () => {
    order.items.forEach((i) => add({ id: i.product_id, name: i.name, price: i.price, image: images[i.product_id] }, i.qty));
    setReordered(true);
    setTimeout(() => setReordered(false), 1800);
  };

  if (!order) return <div className="text-sm text-mute font-mono">Loading…</div>;
  if (order.detail) return <div className="text-sm text-red-700" data-testid="order-not-found">Order not found.</div>;

  const shipping = Math.max(0, Math.round((order.amount - order.items.reduce((s, i) => s + i.price * i.qty, 0)) * 100) / 100);
  return (
    <div data-testid="order-detail-page">
      <Link to="/orders" className="inline-flex items-center gap-2 text-sm text-ink2 hover:text-ink mb-8" data-testid="back-to-orders">
        <ArrowLeft size={14} /> Orders
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-6 mb-10 reveal">
        <div>
          <div className="eyebrow mb-3">Placed {fmtDate(order.created_at, { month: "long", day: "numeric", year: "numeric" })}</div>
          <h1 className="font-display text-4xl sm:text-5xl leading-[1.05] text-ink tracking-tight">
            Order <span className="font-mono text-3xl sm:text-4xl align-middle" data-testid="order-detail-id">{order.id}</span>
          </h1>
        </div>
        <StatusPill status={order.status} />
      </div>

      <div className="grid lg:grid-cols-5 gap-10">
        <section className="lg:col-span-3 space-y-8 reveal reveal-1">
          <div className="bg-white border border-line divide-y divide-line" data-testid="order-items">
            {order.items.map((i) => (
              <div key={i.product_id} className="p-5 flex gap-5 items-center">
                <div className="w-16 h-20 bg-surface overflow-hidden shrink-0">{images[i.product_id] && <img src={images[i.product_id]} alt={i.name} className="h-full w-full object-cover" />}</div>
                <div className="flex-1 min-w-0">
                  <Link to={`/products/${i.product_id}`} className="font-display text-base text-ink hover:underline">{i.name}</Link>
                  <div className="text-xs text-mute font-mono mt-1">{i.qty} × {formatMoney(i.price)}</div>
                </div>
                <span className="stat-num text-sm">{formatMoney(i.price * i.qty)}</span>
              </div>
            ))}
          </div>
          <div className="bg-white border border-line p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-lg text-ink flex items-center gap-2"><Truck size={16} className="text-ink2" /> Shipment</h2>
              <button className="btn-ghost" onClick={handleTrack} disabled={trackBusy} data-testid="order-track-btn">
                {trackBusy ? "Fetching…" : tracking ? "Refresh tracking" : "Track shipment"}
              </button>
            </div>
            {order.customer && (
              <p className="mt-4 text-sm text-ink2" data-testid="order-shipping-address">
                {order.customer.name} · {order.customer.address}, {order.customer.city} {order.customer.postal_code}
              </p>
            )}
            {tracking && <TrackingTimeline tracking={tracking} />}
          </div>
        </section>

        <aside className="lg:col-span-2 reveal reveal-2">
          <div className="bg-white border border-line p-6 sticky top-24">
            <h2 className="font-display text-lg text-ink mb-5">Summary</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-ink2">Items</dt><dd className="stat-num">{formatMoney(order.amount - shipping)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink2">Shipping</dt><dd className="stat-num">{shipping === 0 ? "Free" : formatMoney(shipping)}</dd></div>
              <div className="flex justify-between border-t border-line pt-3 text-base"><dt className="font-medium">Total</dt><dd className="stat-num font-medium" data-testid="order-detail-total">{formatMoney(order.amount)}</dd></div>
            </dl>
            {order.transaction_id && <p className="mt-4 text-[11px] font-mono text-mute">ref {order.transaction_id}</p>}
            <div className="mt-6 grid gap-2">
              <button className="btn-ink w-full" onClick={reorder} data-testid="order-reorder-btn"><RotateCcw size={14} /> {reordered ? "Added to cart" : "Buy again"}</button>
              <Link to={`/help?order=${order.id}`} className="btn-ghost w-full" data-testid="order-help-link"><LifeBuoy size={14} /> Help with this order</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
