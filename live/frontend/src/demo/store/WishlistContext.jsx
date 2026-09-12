import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const WishlistContext = createContext(null);

function readWishlist() {
  try {
    return JSON.parse(localStorage.getItem("lumen:wishlist") || "[]");
  } catch {
    return [];
  }
}

export function WishlistProvider({ children }) {
  const [items, setItems] = useState(readWishlist);

  useEffect(() => {
    localStorage.setItem("lumen:wishlist", JSON.stringify(items));
  }, [items]);

  const toggle = useCallback((product) => {
    setItems((prev) => (prev.some((i) => i.id === product.id) ? prev.filter((i) => i.id !== product.id) : [...prev, { id: product.id, name: product.name, price: product.price, image: product.image, category: product.category, tagline: product.tagline, saved_at: Date.now() }]));
  }, []);
  const remove = useCallback((id) => setItems((prev) => prev.filter((i) => i.id !== id)), []);
  const has = useCallback((id) => items.some((i) => i.id === id), [items]);

  const value = useMemo(() => ({ items, toggle, remove, has, count: items.length }), [items, toggle, remove, has]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export const useWishlist = () => useContext(WishlistContext);
