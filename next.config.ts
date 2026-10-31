import type { NextConfig } from "next";

// Наш бэкенд (репо Bsemenii/reciept: npm run server). Браузер всегда ходит в свой origin /api — один туннель на всё
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8787";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Телефон в той же сети открывает dev по http://<LAN-IP>:3000 — без этого HMR с него блокируется (403)
  allowedDevOrigins: ["192.168.*.*", "*.trycloudflare.com"],
  rewrites: async () => [{ source: "/api/:path*", destination: `${BACKEND_URL}/api/:path*` }],
  experimental: {
    // По умолчанию прокси рвёт запрос через 30 с; распознавание с повторным чтением может идти дольше
    proxyTimeout: 120_000,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
