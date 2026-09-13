import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <div className="mark">◈ ShadowQA</div>
      </div>
      <nav className="tabs">
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
          Watching
        </NavLink>
        <NavLink to="/context" className={({ isActive }) => (isActive ? "active" : "")}>
          Context
        </NavLink>
        <NavLink to="/plans" className={({ isActive }) => (isActive ? "active" : "")}>
          Plans
        </NavLink>
        <NavLink to="/jobs" className={({ isActive }) => (isActive ? "active" : "")}>
          Jobs
        </NavLink>
        <NavLink to="/findings" className={({ isActive }) => (isActive ? "active" : "")}>
          Findings
        </NavLink>
        <NavLink to="/live" className={({ isActive }) => (isActive ? "active" : "")}>
          Live
        </NavLink>
      </nav>
      {children}
    </div>
  );
}
