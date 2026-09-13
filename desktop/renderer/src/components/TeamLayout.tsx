import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export function TeamLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <div className="mark" style={{ marginBottom: 24 }}>
        ◈ ShadowQA — Team
      </div>
      <nav className="tabs">
        <NavLink to="/team/dashboard" className={({ isActive }) => (isActive ? "active" : "")}>
          Watching
        </NavLink>
        <NavLink to="/team/plans" className={({ isActive }) => (isActive ? "active" : "")}>
          Plans
        </NavLink>
        <NavLink to="/team/jobs" className={({ isActive }) => (isActive ? "active" : "")}>
          Jobs
        </NavLink>
        <NavLink to="/team/findings" className={({ isActive }) => (isActive ? "active" : "")}>
          Findings
        </NavLink>
        <NavLink to="/team/admin" className={({ isActive }) => (isActive ? "active" : "")}>
          Admin
        </NavLink>
      </nav>
      {children}
    </div>
  );
}
