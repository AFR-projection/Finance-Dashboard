import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Only indexable marketing pages. /masuk is deliberately absent: it is
 * noindex (login pages have no search value), and a sitemap must never list
 * URLs that robots meta then contradicts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/daftar`, changeFrequency: "monthly", priority: 0.8 },
  ];
}
