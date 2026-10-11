import type { Metadata, Viewport } from "next";
import { LanguageProvider } from "@/components/LanguageProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Calicut Bus Guide | കാലിക്കറ്റ് ബസ് ഗൈഡ്",
  description: "Find private bus routes, timings and fares in Kozhikode, Kerala (demo data).",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#16883f" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
