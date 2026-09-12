import { Link } from "react-router-dom";
import { ArrowUpRight, ShoppingBag, X } from "lucide-react";
import { PageHeader } from "../components/Field";
import { formatMoney } from "../lib/money";
import { useCart } from "../store/CartContext";
import { useWishlist } from "../store/WishlistContext";

export default function Wishlist() {
  const { items, remove } = useWishlist();
  const { add } = useCart();

  return (
    <div data-testid="wishlist-page">
      <PageHeader eyebrow={`${items.length} saved item${items.length === 1 ? "" : "s"}`} title={<>Saved for <span className="italic font-light">later</span></>}>
        <Link to="/products" className="btn-ghost" data-testid="wishlist-browse-btn">Browse catalog <ArrowUpRight size={16} /></Link>
      </PageHeader>
      {items.length === 0 ? (
        <div className="bg-white border border-line p-12 text-center reveal" data-testid="wishlist-empty">
          <p className="text-ink2">Nothing saved yet. Tap the heart on any product to keep it here.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="wishlist-grid">
          {items.map((p, i) => (
            <div key={p.id} className={`bg-white border border-line card-lift reveal reveal-${(i % 4) + 1}`} data-testid={`wishlist-item-${p.id}`}>
              <Link to={`/products/${p.id}`} className="block aspect-[4/5] overflow-hidden bg-surface">
                <img src={p.image} alt={p.name} className="h-full w-full object-cover" loading="lazy" />
              </Link>
              <div className="p-5">
                <div className="eyebrow mb-2">{p.category}</div>
                <h3 className="font-display text-lg leading-snug text-ink">{p.name}</h3>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="stat-num text-base text-ink">{formatMoney(p.price)}</span>
                  <div className="flex items-center gap-2">
                    <button
                      className="inline-flex items-center gap-1.5 border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-ink hover:text-canvas"
                      onClick={() => {
                        add(p);
                        remove(p.id);
                      }}
                      data-testid={`wishlist-move-${p.id}`}
                    >
                      <ShoppingBag size={13} /> Move to cart
                    </button>
                    <button className="text-mute hover:text-ink" onClick={() => remove(p.id)} aria-label="Remove" data-testid={`wishlist-remove-${p.id}`}>
                      <X size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
