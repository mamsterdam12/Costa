import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        sun: {
          50: "#fff8ec",
          100: "#ffedc7",
          400: "#ffb238",
          500: "#f7941d",
          600: "#e07b0e",
        },
        sea: {
          50: "#eefbfb",
          100: "#d3f3f3",
          400: "#3aa7a7",
          500: "#227d7d",
          600: "#1a6363",
          900: "#0f2f36",
        },
      },
    },
  },
  plugins: [],
};

export default config;
