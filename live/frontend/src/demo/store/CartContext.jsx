import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { subtotalOf } from "../lib/money";

const CartContext = createContext(null);

function readCart() {
  try {
    return JSON.parse(localStorage.getItem("lumen:cart") || "[]");
  } catch {
    return [];
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(readCart);

  useEffect(() => {
    localStorage.setItem("lumen:cart", JSON.stringify(items));
  }, [items]);

  const add = useCallback((product, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === product.id);
      if (existing) return prev.map((i) => (i.id === product.id ? { ...i, qty: Math.min(20, i.qty + qty) } : i));
      return [...prev, { id: product.id, name: product.name, price: product.price, image: product.image, qty }];
    });
  }, []);

  const setQty = useCallback((id, qty) => {
    setItems((prev) => (qty <= 0 ? prev.filter((i) => i.id !== id) : prev.map((i) => (i.id === id ? { ...i, qty } : i))));
  }, []);

  const remove = useCallback((id) => setItems((prev) => prev.filter((i) => i.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);

  const value = useMemo(
    () => ({ items, add, setQty, remove, clear, count: items.reduce((n, i) => n + i.qty, 0), subtotal: subtotalOf(items) }),
    [items, add, setQty, remove, clear],
  );
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
