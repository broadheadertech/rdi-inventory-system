"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Flame, TrendingUp } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { cn, formatPrice } from "@/lib/utils";

interface TrendingInCityProps {
  city?: string;
}

export function TrendingInCity({ city = "Manila" }: TrendingInCityProps) {
  const data = useQuery(api.analytics.trendingByCity.getTrendingInCity, {
    city,
  });

  if (!data || data.items.length === 0) return null;

  return (
    <section className="w-full py-6">
      {/* Section header */}
      <div className="mb-4 flex items-center gap-2 px-4">
        <Flame className="h-5 w-5 text-[#E8192C]" />
        <h2 className="text-lg font-bold text-white">
          Trending in {data.city}
        </h2>
        <TrendingUp className="ml-1 h-4 w-4 text-gray-500" />
      </div>

      {/* Horizontal scroll */}
      <div className="scrollbar-hide flex gap-3 overflow-x-auto px-4 pb-2">
        {data.items.map((item, index) => (
          <Link
            key={item.styleId}
            href={`/browse/style/${item.styleId}`}
            className={cn(
              "group relative flex-shrink-0 overflow-hidden rounded-lg border border-[#1A1A1A] bg-[#111111] transition-all hover:border-[#E8192C]/40 hover:shadow-[0_0_20px_rgba(232,25,44,0.1)]",
              "w-[160px] sm:w-[180px]"
            )}
          >
            {/* Rank badge */}
            <div className="absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#E8192C] text-xs font-bold text-white shadow-md">
              {index + 1}
            </div>

            {/* Image */}
            <div className="relative aspect-[3/4] w-full bg-[#0A0A0A]">
              {item.imageUrl ? (
                <Image
                  src={item.imageUrl}
                  alt={item.styleName}
                  fill
                  sizes="180px"
                  className="object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-600">
                  <Flame className="h-8 w-8" />
                </div>
              )}
            </div>

            {/* Card body */}
            <div className="flex flex-col gap-1 p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                {item.brandName}
              </p>
              <h3 className="line-clamp-2 text-xs font-medium leading-tight text-gray-200">
                {item.styleName}
              </h3>
              <p className="font-mono text-sm font-bold text-[#E8192C]">
                {formatPrice(item.priceCentavos)}
              </p>
              <p className="text-[10px] text-gray-500">
                {item.totalSold} sold this week
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
