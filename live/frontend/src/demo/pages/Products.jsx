import { useEffect, useState } from "react";
import { fetchProducts } from "../api/store";
import { PageHeader } from "../components/Field";
import { ProductCard } from "../components/ProductCard";

export default function Products() {
  const [data, setData] = useState({ products: [], categories: [] });
  const [category, setCategory] = useState(null);

  useEffect(() => {
    fetchProducts().then(setData);
  }, []);

  const visible = data.products.filter((p) => !category || p.category === category);
  return (
    <div data-testid="products-page">
      <PageHeader eyebrow="Catalog — Summer 2026" title={<>Field-grade <span className="italic font-light">goods</span></>} />
      <div className="flex flex-wrap gap-2 mb-8 reveal reveal-1" data-testid="category-filters">
        {[null, ...data.categories].map((c) => (
          <button
            key={c || "all"}
            onClick={() => setCategory(c)}
            data-testid={`filter-${(c || "all").toLowerCase().replace(/[^a-z]+/g, "-")}`}
            className={`px-3.5 py-1.5 text-xs font-mono uppercase tracking-wider border transition-colors duration-200 ${
              category === c ? "bg-ink text-canvas border-ink" : "border-line text-ink2 hover:border-ink hover:text-ink"
            }`}
          >
            {c || "All"}
          </button>
        ))}
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="product-grid">
        {visible.map((p, i) => (
          <ProductCard key={p.id} product={p} index={i} />
        ))}
      </div>
    </div>
  );
}
