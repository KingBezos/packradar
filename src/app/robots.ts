import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const site = process.env.SITE_URL || "http://localhost:3000";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/alerts", "/profile"] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
