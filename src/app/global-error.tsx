"use client";

// Last-resort boundary: replaces the whole page, so it carries its own <html> and cannot use the providers.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, 'Nirmala UI', sans-serif", padding: "2rem", maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
        <h1>This page could not be shown</h1>
        <p lang="ml">ഈ പേജ് കാണിക്കാൻ കഴിഞ്ഞില്ല</p>
        <p>Something went wrong on our side. Please try again.</p>
        <button onClick={reset} style={{ minHeight: 44, padding: "0 1.5rem", fontSize: 16 }}>Try again / വീണ്ടും ശ്രമിക്കുക</button>
      </body>
    </html>
  );
}
