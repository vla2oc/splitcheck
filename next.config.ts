import type { NextConfig } from "next";

// /api/parse — Route Handler этого же приложения (src/app/api/parse), отдельного бэкенда и прокси нет
const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Телефон в той же сети открывает dev по http://<LAN-IP>:3000 — без этого HMR с него блокируется (403)
  allowedDevOrigins: ["192.168.*.*", "*.trycloudflare.com"],
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
