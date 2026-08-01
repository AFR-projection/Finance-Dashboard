import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Everything behind auth or machine-only is worthless in an index.
      disallow: ["/api/", "/dashboard", "/settings", "/access", "/setup", "/denied", "/share/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
