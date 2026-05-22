import type { Config } from 'tailwindcss';

// Tailwind v4 — theme tokens are defined in globals.css via @theme.
// This file is only needed for content path configuration.
const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
};

export default config;
