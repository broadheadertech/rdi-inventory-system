"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

const BRAND_KEYS = ["brandPrimary", "brandSecondary", "brandName"] as const;

const CSS_VAR_MAP: Record<string, string> = {
  brandPrimary: "--brand-primary",
  brandSecondary: "--brand-secondary",
  brandName: "--brand-name",
};

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const settings = useQuery(api.admin.settings.getSettings);
  const siteAssets = useQuery(api.admin.settings.getSiteAssets);

  const style: Record<string, string> = {};
  if (settings) {
    for (const key of BRAND_KEYS) {
      if (settings[key]) {
        const cssVar = CSS_VAR_MAP[key];
        style[cssVar] = key === "brandName" ? `"${settings[key]}"` : settings[key];
      }
    }
  }

  // Dynamic favicon — inject <link rel="icon"> into <head>
  useEffect(() => {
    const faviconUrl = siteAssets?.siteFaviconUrl;
    if (!faviconUrl) return;

    // Find or create the favicon link element
    let link = document.querySelector<HTMLLinkElement>(
      'link[rel="icon"][data-dynamic]'
    );
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      link.setAttribute("data-dynamic", "true");
      document.head.appendChild(link);
    }
    link.href = faviconUrl;

    return () => {
      link?.remove();
    };
  }, [siteAssets?.siteFaviconUrl]);

  return (
    <div style={style} className="contents">
      {children}
    </div>
  );
}
