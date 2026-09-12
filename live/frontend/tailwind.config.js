/** @type {import('tailwindcss').Config} */
// ShadowQA palette: charcoal and off-white only. The former brass/amber/forest accents resolve to
// the ink so every existing utility class in the demo store and the Command Center renders in the
// two brand values without a per-file rewrite. Red and green are reserved for verdicts and are set
// inline where a verdict is drawn.
module.exports = {
  blocklist: ["overline"],
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Source Serif Pro"', '"Source Serif 4"', "Georgia", "serif"],
        sans: ['"Work Sans"', "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        canvas: "#F4F1EA",
        surface: "#EDE9E0",
        line: "#D9D5CC",
        ink: "#1C1C1C",
        ink2: "#6F6C66",
        mute: "#A9A59D",
        brass: "#1C1C1C",
        amber: "#1C1C1C",
        forest: "#1C1C1C",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(10px)" }, to: { opacity: "1", transform: "translateY(0)" } },
      },
      animation: { rise: "rise 0.5s cubic-bezier(0.16, 1, 0.3, 1) both" },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
