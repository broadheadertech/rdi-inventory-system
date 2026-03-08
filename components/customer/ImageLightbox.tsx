"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export function ImageLightbox({ images, initialIndex, onClose }: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % images.length);
  }, [images.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, goNext, goPrev]);

  // Lock body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95"
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery"
    >
      {/* Backdrop click-to-close */}
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 transition-colors"
        aria-label="Close gallery"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Image counter */}
      {images.length > 1 && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10 text-sm text-white/70 font-medium select-none">
          {currentIndex + 1} / {images.length}
        </div>
      )}

      {/* Main image area */}
      <div
        className="relative z-10 flex items-center justify-center w-full h-full px-16 py-20"
        onClick={(e) => {
          // Close only when clicking the padding area, not the image itself
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="relative w-full h-full max-w-[90vw] max-h-[80vh]">
          <Image
            key={currentIndex}
            src={images[currentIndex]}
            alt={`Image ${currentIndex + 1} of ${images.length}`}
            fill
            sizes="90vw"
            className="object-contain animate-in fade-in duration-200"
            priority
          />
        </div>
      </div>

      {/* Left arrow */}
      {images.length > 1 && (
        <button
          onClick={goPrev}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 transition-colors"
          aria-label="Previous image"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Right arrow */}
      {images.length > 1 && (
        <button
          onClick={goNext}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20 transition-colors"
          aria-label="Next image"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div className="absolute bottom-4 z-10 flex gap-2 overflow-x-auto max-w-[90vw] px-4 py-2 [&::-webkit-scrollbar]:hidden">
          {images.map((url, i) => (
            <button
              key={i}
              onClick={() => setCurrentIndex(i)}
              className={`relative h-14 w-14 flex-shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                i === currentIndex
                  ? "border-white ring-1 ring-white/50 scale-110"
                  : "border-transparent opacity-50 hover:opacity-80"
              }`}
              aria-label={`Go to image ${i + 1}`}
            >
              <Image
                src={url}
                alt={`Thumbnail ${i + 1}`}
                fill
                sizes="56px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
