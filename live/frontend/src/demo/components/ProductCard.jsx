import { Link } from "react-router-dom";
import { Heart, Plus } from "lucide-react";
import { formatMoney } from "../lib/money";
import { useCart } from "../store/CartContext";
import { useWishlist } from "../store/WishlistContext";

export function ProductCard({ product, index = 0 }) {
  const { add } = useCart();
  const wishlist = useWishlist();
  const saved = wishlist?.has(product.id);
  const stop = (fn) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };
  return (
    <Link
      to={`/products/${product.id}`}
      data-testid={`product-card-${product.id}`}
      className={`group relative block bg-white border border-line card-lift reveal reveal-${(index % 4) + 1}`}
    >
      <div className="aspect-[4/5] overflow-hidden bg-surface">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          loading="lazy"
        />
      </div>
      <button
        type="button"
        aria-label={saved ? "Remove from wishlist" : "Save to wishlist"}
        aria-pressed={saved}
        data-testid={`wishlist-toggle-${product.id}`}
        onClick={stop(() => wishlist?.toggle(product))}
        className={`absolute top-3 right-3 h-9 w-9 grid place-items-center rounded-full border backdrop-blur-md transition-[background-color,color,transform] duration-200 active:scale-95 ${
          saved ? "bg-amber border-amber text-canvas" : "bg-canvas/80 border-line text-ink2 hover:text-ink hover:border-ink"
        }`}
      >
        <Heart size={15} strokeWidth={1.75} className={saved ? "fill-current" : ""} />
      </button>
      <div className="p-5">
        <div className="eyebrow mb-2">{product.category}</div>
        <h3 className="font-display text-lg leading-snug text-ink">{product.name}</h3>
        <p className="mt-1 text-sm text-ink2">{product.tagline}</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="stat-num text-base text-ink" data-testid={`product-price-${product.id}`}>{formatMoney(product.price)}</span>
          <button
            type="button"
            data-testid={`add-to-cart-${product.id}`}
            onClick={stop(() => add(product))}
            className="inline-flex items-center gap-1.5 border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-ink hover:text-canvas"
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>
    </Link>
  );
}
