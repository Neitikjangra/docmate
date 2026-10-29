import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,js,jsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Docmate design tokens (PRD 2.2 / Blueprint 2)
        night: "#0A1014",
        night2: "#0E161B",
        night3: "#131E24",
        cream: "#EFE5D6",
        mint: "#6EE0CF",
        mintDim: "#3F8C82",
        terracotta: "#D4705A",
        terracottaDim: "#8F4A3B",
        alertred: "#D83F3A",
        sage: "#E6E1CC",
        muted: "#8A8F8C",
        hairline: "#1E2A31",
      },
      fontFamily: {
        display: [
          "Space Grotesk",
          "Bricolage Grotesque",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
        body: ["Manrope", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
      borderRadius: {
        xl2: "20px",
        xl3: "28px",
      },
      keyframes: {
        heartbeat: {
          "0%,100%": { transform: "scaleX(1)", opacity: "0.85" },
          "50%": { transform: "scaleX(1.04)", opacity: "1" },
        },
        pulseRing: {
          "0%": { transform: "scale(0.94)", opacity: "0.85" },
          "70%": { transform: "scale(1.25)", opacity: "0" },
          "100%": { transform: "scale(1.25)", opacity: "0" },
        },
        slideUp: {
          from: { transform: "translateY(16px)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        sosFlash: {
          "0%,100%": { backgroundColor: "#8E1F1B" },
          "50%": { backgroundColor: "#D83F3A" },
        },
        dash: {
          to: { strokeDashoffset: "0" },
        },
      },
      animation: {
        heartbeat: "heartbeat 2.4s ease-in-out infinite",
        "pulse-ring": "pulseRing 2s cubic-bezier(0.4,0,0.6,1) infinite",
        "slide-up": "slideUp 0.28s ease-out both",
        "fade-in": "fadeIn 0.2s ease-out both",
        "sos-flash": "sosFlash 1s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
