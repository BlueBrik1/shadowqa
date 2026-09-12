import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import { initShadowQA } from "@/shadowqa";

// ShadowQA runtime SDK: observes this application ambiently and talks to the local workspace bridge.
initShadowQA({
  bridgeUrl: `${process.env.REACT_APP_BACKEND_URL}/api/shadowqa`,
  token: process.env.REACT_APP_SHADOWQA_TOKEN,
  appName: "Lumen Supply Co.",
  getState: () => {
    try {
      const cart = JSON.parse(localStorage.getItem("lumen:cart") || "[]");
      return {
        authenticated: Boolean(localStorage.getItem("lumen:token")),
        cart_items: cart.reduce((n, i) => n + i.qty, 0),
        cart_product_ids: cart.map((i) => i.id),
      };
    } catch {
      return null;
    }
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
