import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login as loginRequest } from "../api/store";

const AuthContext = createContext(null);

function readUser() {
  try {
    return JSON.parse(localStorage.getItem("lumen:user") || "null");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readUser);
  const navigate = useNavigate();

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      navigate("/login", { replace: true });
    };
    window.addEventListener("lumen:unauthorized", onUnauthorized);
    return () => window.removeEventListener("lumen:unauthorized", onUnauthorized);
  }, [navigate]);

  const login = useCallback(async (email, password) => {
    const data = await loginRequest(email, password);
    if (!data.token) throw new Error(typeof data.detail === "string" ? data.detail : "Login failed");
    localStorage.setItem("lumen:token", data.token);
    localStorage.setItem("lumen:user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("lumen:token");
    localStorage.removeItem("lumen:user");
    setUser(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
