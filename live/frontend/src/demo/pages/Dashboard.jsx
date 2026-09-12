import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { fetchDashboard } from "../api/store";
import { formatMoney } from "../lib/money";
import { PageHeader, StatusPill } from "../components/Field";
import { ProductCard } from "../components/ProductCard";

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetchDashboard().then(setData);
  }, []);

  const stats = data?.stats;
  return (
    <div data-testid="dashboard-page">
      <PageHeader eyebrow={`Welcome back${data ? `, ${data.user.name}` : ""}`} title={<>Your field <span className="italic font-light">ledger</span></>}>
        <Link to="/products" className="btn-ghost" data-testid="dashboard-browse-btn">
          Browse catalog <ArrowUpRight size={16} />
        </Link>
      </PageHeader>

      <section className="grid grid-cols-2 lg:grid-cols-4 border border-line bg-white divide-x divide-line reveal reveal-1" data-testid="dashboard-stats">
        {[
          ["Orders", stats?.orders ?? "—", "lifetime"],
          ["Spend", stats ? formatMoney(stats.spend) : "—", "USD"],
          ["Items", stats?.items ?? "—", "shipped"],
          ["Open", stats?.open ?? "—", "in progress"],
        ].map(([label, value, note]) => (
          <div key={label} className="p-6">
            <div className="eyebrow">{label}</div>
            <div className="stat-num text-3xl text-ink mt-3" data-testid={`stat-${label.toLowerCase()}`}>{value}</div>
            <div className="text-xs text-mute mt-1">{note}</div>
          </div>
        ))}
      </section>

      <section className="mt-12 grid lg:grid-cols-5 gap-10">
        <div className="lg:col-span-3 reveal reveal-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg text-ink">Recent orders</h2>
            <Link to="/orders" className="text-sm text-ink2 hover:text-ink" data-testid="dashboard-orders-link">All orders →</Link>
          </div>
          <div className="bg-white border border-line divide-y divide-line" data-testid="recent-orders">
            {(data?.recent_orders || []).map((o) => (
              <div key={o.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono text-sm text-ink">{o.id}</div>
                  <div className="text-xs text-mute mt-0.5">{new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · {o.items.length} item{o.items.length > 1 ? "s" : ""}</div>
                </div>
                <div className="flex items-center gap-5">
                  <StatusPill status={o.status} />
                  <span className="stat-num text-sm">{formatMoney(o.amount)}</span>
                </div>
              </div>
            ))}
            {data && data.recent_orders.length === 0 && <div className="px-5 py-8 text-sm text-mute">No orders yet.</div>}
          </div>
        </div>
        <div className="lg:col-span-2 reveal reveal-3">
          <h2 className="font-display text-lg text-ink mb-4">Featured this season</h2>
          <div className="grid gap-4">
            {(data?.featured || []).slice(0, 2).map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
