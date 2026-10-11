"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/reel-to-travel", label: "Reel-to-Travel" },
  { href: "/my-voyage", label: "My Voyage" },
  { href: "/trips", label: "Trips" },
  { href: "/community", label: "Community" },
  { href: "/bus-guide", label: "🚌 Bus Guide", isSpecial: true },
];

export function Navbar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/reel-to-travel") return pathname === "/reel-to-travel" || pathname?.startsWith("/saved");
    return pathname?.startsWith(href);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[#163d46]/15 bg-[#163d46] text-[#f8f5ef] shadow-md backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand Logo */}
        <Link href="/" className="group flex items-center gap-2.5 transition">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#a8d9df] text-lg text-[#163d46] shadow-xs transition duration-300 group-hover:rotate-12"
          >
            🧭
          </span>
          <div className="flex flex-col">
            <span className="editorial-title text-xl font-bold tracking-wider text-white">VOYAGE</span>
            <span className="text-[10px] tracking-widest text-[#a8d9df] uppercase">Discovery &amp; Planning</span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav aria-label="Main Navigation" className="hidden md:flex md:items-center md:gap-1 text-sm font-medium">
          {NAV_LINKS.map(({ href, label, isSpecial }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={`inline-flex min-h-10 items-center rounded-xl px-3.5 py-1.5 transition ${
                  isSpecial
                    ? "ml-2 bg-[#a8d9df]/20 text-[#a8d9df] ring-1 ring-[#a8d9df]/30 hover:bg-[#a8d9df]/30"
                    : active
                    ? "bg-white/20 font-semibold text-white shadow-xs"
                    : "text-[#f8f5ef]/80 hover:bg-white/10 hover:text-white"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/reel-to-travel"
            className="rounded-lg bg-[#a8503a] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#8a4230]"
          >
            + Save Reel
          </Link>
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle Navigation Menu"
            aria-expanded={isOpen}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white"
          >
            {isOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="border-t border-white/10 bg-[#0f2a30] px-4 py-4 md:hidden">
          <nav aria-label="Mobile Navigation" className="flex flex-col gap-1.5">
            {NAV_LINKS.map(({ href, label, isSpecial }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsOpen(false)}
                  className={`flex min-h-11 items-center rounded-xl px-4 py-2 text-base transition ${
                    isSpecial
                      ? "mt-2 bg-[#a8d9df]/20 font-semibold text-[#a8d9df]"
                      : active
                      ? "bg-white/20 font-bold text-white"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
