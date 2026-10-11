"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import type { ActionState } from "@/app/admin/actions";

const FlashContext = createContext<(s: ActionState) => void>(() => {});
export const useFlash = () => useContext(FlashContext);

/**
 * Confirmation banner that survives page refreshes. After an action succeeds the page re-renders and the
 * form that was used may disappear (for example the "verify" form once a bus is verified); without this the
 * admin would get no feedback at all. It is also the one live region that screen readers announce.
 */
export function FlashProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<ActionState>(null);
  const path = usePathname();
  useEffect(() => setMsg(null), [path]); // a message belongs to the page it was shown on

  return (
    <FlashContext.Provider value={setMsg}>
      <div role="status" aria-live="polite" className="pointer-events-none sticky top-2 z-40 h-0 overflow-visible">
        {msg && (
          <div
            className={`pointer-events-auto flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${
              msg.ok ? "border-brand-300 bg-brand-50 text-brand-900" : "border-rose-300 bg-rose-50 text-rose-900"
            }`}
          >
            <span>{msg.ok ? "✅ " : "⚠️ "}{msg.message}</span>
            <button type="button" onClick={() => setMsg(null)} aria-label="Dismiss message" className="-my-2 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full hover:bg-black/5">✕</button>
          </div>
        )}
      </div>
      {children}
    </FlashContext.Provider>
  );
}
