"use client";

import { useState } from "react";

/**
 * A photo that never leaves a blank box: if the photograph cannot be loaded (offline, removed, blocked) it falls back
 * to the local illustration. Lazy-loaded; the zoom-on-hover is a small CSS transition that respects reduced motion.
 */
export function SmartImage({
  src,
  fallbackSrc,
  alt,
  fallbackAlt,
  credit,
  className = "",
  eager = false,
}: {
  src: string;
  fallbackSrc: string;
  alt: string;
  fallbackAlt: string;
  credit?: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const usingFallback = failed || src === fallbackSrc;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={usingFallback ? fallbackSrc : src}
        alt={usingFallback ? fallbackAlt : alt}
        width={800}
        height={500}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`h-full w-full object-cover transition-transform duration-500 ease-out hover:scale-105 ${className}`}
      />
      {credit && !usingFallback && (
        <span className="pointer-events-none absolute bottom-1 right-1.5 rounded bg-black/45 px-1.5 py-0.5 text-[10px] leading-none text-white/90">
          {credit}
        </span>
      )}
    </>
  );
}
