import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: "#0F172A",
          deep: "#111827",
          yellow: "#FACC15",
          softYellow: "#FEF3C7",
          green: "#34D399",
          blue: "#818CF8",
          pink: "#FB7185",
          orange: "#FDBA74",
          mint: "#A7F3D0",
          bg: "#F8FAFC",
          card: "#FFFFFF",
          border: "#E5E7EB",
          text: "#111827",
          muted: "#6B7280",
          indigo: "#5C5FFF",
          indigoLight: "#EEF2FF",
          // Student-app brand tokens, extracted from the live login screen (app/login/page.tsx)
          // and the current red AIMON logo. Additive only — existing keys above are untouched
          // because Sprint and Admin screens still depend on them.
          primary: "#E86F6B",
          primaryHover: "#DC625E",
          primaryPressed: "#C8433F",
          primarySoft: "#FFF1F0",
          primaryBorder: "#F1D8D7",
          // Full student-app neutral/system scale (unification pass). Text/ink tokens replace
          // the old #17213B "navy" that had drifted into being the app's default text color.
          page: "#F7F8FA",
          surface: "#FFFFFF",
          surfaceSecondary: "#F2F4F6",
          borderDefault: "#E5E7EB",
          borderStrong: "#D0D5DD",
          ink: "#1F2933",
          inkSecondary: "#667085",
          inkMuted: "#98A2B3",
        },
      },
      boxShadow: {
        card: "0 4px 20px rgba(15, 23, 42, 0.06)",
        "card-hover": "0 8px 30px rgba(15, 23, 42, 0.10)",
        nav: "0 20px 50px rgba(15, 23, 42, 0.32)",
      },
      borderRadius: {
        "4xl": "2rem",
      },
    },
  },
  plugins: [],
};

export default config;
