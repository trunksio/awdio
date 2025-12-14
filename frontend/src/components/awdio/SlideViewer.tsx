"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface SlideViewerProps {
  slideUrl: string | null;
  slideIndex: number;
  totalSlides: number;
  isLoading?: boolean;
  onSlideClick?: () => void;
  showSlideNumber?: boolean;
  className?: string;
}

export function SlideViewer({
  slideUrl,
  slideIndex,
  totalSlides,
  isLoading = false,
  onSlideClick,
  showSlideNumber = true,
  className = "",
}: SlideViewerProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Log for debugging
  useEffect(() => {
    console.log("[SlideViewer] Props:", { slideUrl, slideIndex, totalSlides, isLoading });
  }, [slideUrl, slideIndex, totalSlides, isLoading]);

  // Reset states when slide changes
  useEffect(() => {
    console.log("[SlideViewer] Slide URL changed, resetting state:", slideUrl);
    setImageError(false);
    setImageLoaded(false);
  }, [slideUrl]);

  // Handle cached images - check if already complete after mount
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current?.naturalHeight !== 0) {
      console.log("[SlideViewer] Image already loaded (cached)");
      setImageLoaded(true);
    }
  }, [slideUrl]);

  const handleImageLoad = useCallback(() => {
    console.log("[SlideViewer] Image onLoad fired");
    setImageLoaded(true);
  }, []);

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    console.error("[SlideViewer] Image onError fired:", (e.target as HTMLImageElement)?.src);
    setImageError(true);
  }, []);

  return (
    <div
      className={`relative w-full h-full bg-black flex items-center justify-center ${className}`}
      onClick={onSlideClick}
    >
      {/* Loading state */}
      {(isLoading || (!imageLoaded && slideUrl && !imageError)) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin" />
            <span className="text-white/60 text-sm">Loading slide...</span>
          </div>
        </div>
      )}

      {/* Error state */}
      {imageError && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <svg
              className="w-16 h-16 mx-auto text-gray-600 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-gray-400">Failed to load slide</p>
          </div>
        </div>
      )}

      {/* No slide state */}
      {!slideUrl && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <div className="text-center">
            <svg
              className="w-16 h-16 mx-auto text-gray-600 mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-gray-400">No slide available</p>
          </div>
        </div>
      )}

      {/* Slide image */}
      {slideUrl && !imageError && (
        <div className="relative w-full h-full flex items-center justify-center">
          <img
            ref={imgRef}
            src={slideUrl}
            alt={`Slide ${slideIndex + 1}`}
            className={`max-w-full max-h-full object-contain transition-opacity duration-300 ${
              imageLoaded ? "opacity-100" : "opacity-0"
            }`}
            onLoad={handleImageLoad}
            onError={handleImageError}
          />
        </div>
      )}

      {/* Slide number indicator */}
      {showSlideNumber && totalSlides > 0 && (
        <div className="absolute bottom-4 right-4 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-lg text-white text-sm font-medium">
          {slideIndex + 1} / {totalSlides}
        </div>
      )}
    </div>
  );
}

interface SlideNavigatorProps {
  thumbnails: { url: string | null; index: number }[];
  currentSlideIndex: number;
  onSlideSelect: (index: number) => void;
  className?: string;
}

export function SlideNavigator({
  thumbnails,
  currentSlideIndex,
  onSlideSelect,
  className = "",
}: SlideNavigatorProps) {
  return (
    <div className={`flex gap-2 overflow-x-auto py-2 px-4 ${className}`}>
      {thumbnails.map(({ url, index }) => (
        <button
          key={index}
          onClick={() => onSlideSelect(index)}
          className={`relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden border-2 transition-all ${
            index === currentSlideIndex
              ? "border-white ring-2 ring-white/20"
              : "border-gray-700 hover:border-gray-500"
          }`}
        >
          {url ? (
            <img
              src={url}
              alt={`Slide ${index + 1}`}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
              <span className="text-gray-500 text-xs">{index + 1}</span>
            </div>
          )}
          {index === currentSlideIndex && (
            <div className="absolute inset-0 bg-white/10" />
          )}
        </button>
      ))}
    </div>
  );
}
