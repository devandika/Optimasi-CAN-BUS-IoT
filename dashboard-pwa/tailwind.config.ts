import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg-canvas)",
        glass: {
          DEFAULT: "var(--glass-bg)",
          elevated: "var(--glass-bg-elevated)",
          subtle: "var(--glass-bg-subtle)",
          border: "var(--glass-outline)",
          borderStrong: "var(--glass-border-strong)",
        },
        ink: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        cat: {
          yellow: "#FFCD00",
          yellowHover: "#E5B800",
          accent: "var(--accent-primary)",
          muted: "var(--text-muted)",
          text: "var(--text-primary)",
        },
      },
      fontFamily: {
        display: ["'Outfit'", "'Plus Jakarta Sans'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        sans: ["'Plus Jakarta Sans'", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
