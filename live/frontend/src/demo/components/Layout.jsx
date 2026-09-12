import { Link, NavLink, Outlet } from "react-router-dom";
import { Heart, LogOut, ShoppingBag, SlidersHorizontal } from "lucide-react";
import { useAuth } from "../store/AuthContext";
import { useCart } from "../store/CartContext";
import { useWishlist } from "../store/WishlistContext";

const links = [
  { to: "/", label: "Dashboard", testid: "nav-dashboard" },
  { to: "/products", label: "Products", testid: "nav-products" },
  { to: "/orders", label: "Orders", testid: "nav-orders" },
  { to: "/wishlist", label: "Wishlist", testid: "nav-wishlist" },
  { to: "/help", label: "Help", testid: "nav-help" },
];

const navClass = ({ isActive }) => `px-3 py-1.5 text-sm whitespace-nowrap transition-colors duration-200 ${isActive ? "text-ink font-medium" : "text-ink2 hover:text-ink"}`;

export function Layout() {
  const { user, logout } = useAuth();
  const { count } = useCart();
  const wishlist = useWishlist();
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between gap-8">
          <Link to="/" className="font-display text-xl tracking-tight text-ink" data-testid="brand-link">
            Lumen <span className="italic font-light">Supply Co.</span>
          </Link>
          <nav className="hidden md:flex items-center gap-1" data-testid="main-nav">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.to === "/"} data-testid={l.testid} className={navClass}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-4">
            <Link to="/wishlist" className="relative hidden sm:inline-flex items-center text-ink2 hover:text-ink transition-colors" data-testid="nav-wishlist-icon" title="Wishlist">
              <Heart size={17} strokeWidth={1.75} />
              {wishlist.count > 0 && <span className="absolute -top-2 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-ink text-canvas text-[10px] font-mono flex items-center justify-center" data-testid="wishlist-count">{wishlist.count}</span>}
            </Link>
            <Link to="/cart" className="relative inline-flex items-center gap-2 text-sm text-ink" data-testid="nav-cart">
              <ShoppingBag size={18} strokeWidth={1.75} />
              <span className="hidden sm:inline">Cart</span>
              {count > 0 && (
                <span className="absolute -top-2 -right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-amber text-canvas text-[10px] font-mono flex items-center justify-center" data-testid="cart-count">
                  {count}
                </span>
              )}
            </Link>
            <Link to="/account" className="hidden sm:block text-xs text-ink2 hover:text-ink font-mono transition-colors" data-testid="user-email" title="Account">{user?.email}</Link>
            <Link to="/settings" className="text-ink2 hover:text-ink transition-colors" title="Preferences" data-testid="nav-settings">
              <SlidersHorizontal size={16} strokeWidth={1.75} />
            </Link>
            <button onClick={logout} className="text-ink2 hover:text-ink transition-colors" title="Sign out" data-testid="logout-btn">
              <LogOut size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>
        <nav className="md:hidden flex items-center gap-1 px-4 pb-2 -mt-1 overflow-x-auto" data-testid="mobile-nav">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === "/"} data-testid={`mobile-${l.testid}`} className={navClass}>
              {l.label}
            </NavLink>
          ))}
          <NavLink to="/account" data-testid="mobile-nav-account" className={navClass}>Account</NavLink>
        </nav>
      </header>
      <main className="flex-1 mx-auto w-full max-w-6xl px-6 py-10">
        <Outlet />
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-mute font-mono">
          <span>© 2026 Lumen Supply Co. — Field-grade goods</span>
          <span className="flex flex-wrap items-center gap-4">
            <Link to="/help" className="hover:text-ink" data-testid="footer-help">Help</Link>
            <Link to="/account" className="hover:text-ink" data-testid="footer-account">Account</Link>
            <Link to="/shadowqa" className="hover:text-ink" data-testid="footer-shadowqa">ShadowQA Command Center</Link>
            <span>Ctrl+Shift+Q · inspector</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
