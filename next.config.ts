import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Let other devices on the local network load the dev server (JS/HMR are blocked otherwise).
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.16.*.*", "*.local", "*.trycloudflare.com"],
  // Using the classic (non-Cache-Components) data model: DB-backed pages are
  // rendered dynamically on each request. Simpler with an embedded database.
  serverExternalPackages: ["@electric-sql/pglite", "web-push", "node-cron", "postgres"],
  outputFileTracingIncludes: {
    "/*": ["./drizzle/**/*", "./src/db/seed/**/*"],
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
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
