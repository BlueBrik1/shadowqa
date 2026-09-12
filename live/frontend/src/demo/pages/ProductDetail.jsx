import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Star } from "lucide-react";
import { fetchProduct } from "../api/store";
import { formatMoney } from "../lib/money";
import { useCart } from "../store/CartContext";

export default function ProductDetail() {
  const { id } = useParams();
  const { add } = useCart();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    setProduct(null);
    fetchProduct(id).then(setProduct);
  }, [id]);

  if (!product) return <div className="text-sm text-mute font-mono">Loading…</div>;
  if (product.detail) return <div className="text-sm text-red-700">Product not found.</div>;

  return (
    <div data-testid="product-detail-page">
      <Link to="/products" className="inline-flex items-center gap-2 text-sm text-ink2 hover:text-ink mb-8" data-testid="back-to-catalog">
        <ArrowLeft size={14} /> Catalog
      </Link>
      <div className="grid lg:grid-cols-2 gap-12">
        <div className="aspect-[4/5] overflow-hidden bg-surface border border-line reveal">
          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
        </div>
        <div className="reveal reveal-1">
          <div className="eyebrow mb-3">{product.category}</div>
          <h1 className="font-display text-4xl leading-[1.05] text-ink tracking-tight" data-testid="product-name">{product.name}</h1>
          <p className="mt-2 text-ink2">{product.tagline}</p>
          <div className="mt-5 flex items-center gap-4">
            <span className="stat-num text-2xl text-ink" data-testid="product-price">{formatMoney(product.price)}</span>
            <span className="inline-flex items-center gap-1 text-sm text-ink2">
              <Star size={14} className="fill-brass text-brass" /> {product.rating} · {product.reviews} reviews
            </span>
            <span className="text-xs font-mono text-mute">{product.stock} in stock</span>
          </div>
          <p className="mt-8 text-[15px] leading-relaxed text-ink2 max-w-prose">{product.description}</p>
          <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-3 border-t border-line pt-6" data-testid="product-specs">
            {Object.entries(product.specs).map(([k, v]) => (
              <div key={k}>
                <dt className="eyebrow !text-[10px]">{k}</dt>
                <dd className="text-sm text-ink mt-1">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-10 flex items-center gap-3">
            <div className="inline-flex items-center border border-line bg-white">
              <button className="px-3 py-3 text-ink2 hover:text-ink" onClick={() => setQty((q) => Math.max(1, q - 1))} data-testid="qty-decrement">−</button>
              <span className="w-8 text-center stat-num text-sm" data-testid="qty-value">{qty}</span>
              <button className="px-3 py-3 text-ink2 hover:text-ink" onClick={() => setQty((q) => Math.min(20, q + 1))} data-testid="qty-increment">+</button>
            </div>
            <button
              className="btn-ink flex-1"
              data-testid="detail-add-to-cart"
              onClick={() => {
                add(product, qty);
                setAdded(true);
                setTimeout(() => setAdded(false), 1600);
              }}
            >
              {added ? "Added to cart" : `Add to cart — ${formatMoney(product.price * qty)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
