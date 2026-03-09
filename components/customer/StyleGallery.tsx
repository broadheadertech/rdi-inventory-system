"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Image from "next/image";
import { useState } from "react";
import { Star, X, Camera } from "lucide-react";
import { cn } from "@/lib/utils";

interface StyleGalleryProps {
  styleId?: Id<"styles">;
}

export function StyleGallery({ styleId }: StyleGalleryProps) {
  const photos = useQuery(api.storefront.styleGallery.getGalleryPhotos, {
    limit: 20,
    styleId,
  });

  const [selectedPhoto, setSelectedPhoto] = useState<{
    url: string;
    review: NonNullable<typeof photos>[number];
  } | null>(null);

  // Loading skeleton
  if (photos === undefined) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Style Gallery</h2>
        <div className="columns-2 md:columns-3 gap-3 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="break-inside-avoid rounded-lg bg-card border border-border overflow-hidden animate-pulse"
            >
              <div
                className="bg-zinc-800"
                style={{ height: `${140 + (i % 3) * 60}px` }}
              />
              <div className="p-3 space-y-2">
                <div className="h-3 w-20 bg-zinc-800 rounded" />
                <div className="h-3 w-28 bg-zinc-800 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (photos.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Style Gallery</h2>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Camera className="h-10 w-10 mb-3 opacity-40" />
          <p className="text-sm">No outfit photos yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Style Gallery</h2>

      {/* Masonry grid */}
      <div className="columns-2 md:columns-3 gap-3 space-y-3">
        {photos.flatMap((photo) =>
          photo.imageUrls.map((url, imgIdx) => (
            <button
              key={`${photo.reviewId}-${imgIdx}`}
              onClick={() => setSelectedPhoto({ url, review: photo })}
              className="break-inside-avoid rounded-lg bg-card border border-border overflow-hidden hover:border-zinc-600 transition-colors w-full text-left"
            >
              <div className="relative w-full aspect-[3/4]">
                <Image
                  src={url}
                  alt={`Outfit by ${photo.customerName}`}
                  fill
                  sizes="(max-width: 768px) 50vw, 33vw"
                  className="object-cover"
                />
              </div>
              <div className="p-3 space-y-1">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={cn(
                        "h-3 w-3",
                        star <= photo.rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-zinc-600"
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-foreground font-medium truncate">
                  {photo.customerName}
                </p>
                {!styleId && (
                  <p className="text-xs text-muted-foreground truncate">
                    {photo.styleName}
                  </p>
                )}
              </div>
            </button>
          ))
        )}
      </div>

      {/* Photo modal/overlay */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <button
            onClick={() => setSelectedPhoto(null)}
            className="absolute top-4 right-4 text-white hover:text-zinc-300 z-10"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>

          <div
            className="relative flex flex-col items-center max-h-[90vh] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative max-h-[70vh] max-w-[90vw]">
              <Image
                src={selectedPhoto.url}
                alt={`Outfit by ${selectedPhoto.review.customerName}`}
                width={800}
                height={1000}
                className="object-contain max-h-[70vh] rounded-lg"
              />
            </div>

            <div className="mt-4 bg-card border border-border rounded-lg p-4 w-full max-w-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  {selectedPhoto.review.customerName}
                </span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={cn(
                        "h-3.5 w-3.5",
                        star <= selectedPhoto.review.rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-zinc-600"
                      )}
                    />
                  ))}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {selectedPhoto.review.styleName} &middot;{" "}
                {selectedPhoto.review.brandName}
              </p>
              {selectedPhoto.review.sizeFeedback && (
                <p className="text-xs text-muted-foreground mt-1">
                  Fit:{" "}
                  {selectedPhoto.review.sizeFeedback === "runs_small"
                    ? "Runs Small"
                    : selectedPhoto.review.sizeFeedback === "true_to_size"
                      ? "True to Size"
                      : "Runs Large"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
