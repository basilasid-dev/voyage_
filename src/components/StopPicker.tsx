"use client";

import { useId, useMemo, useRef, useState } from "react";
import { matchStops } from "@/lib/stop-match";
import type { Stop } from "@/lib/types";
import { useLang } from "./LanguageProvider";

interface Props {
  label: string;
  placeholder: string;
  value: string; // stop id or ""
  onChange: (id: string) => void;
  stops: Stop[];
  labels: Map<string, string>; // stop id -> display label (disambiguated)
  marker: "from" | "to";
}

/** Searchable stop selector (ARIA combobox). Typing tolerates spelling variations. */
export function StopPicker({ label, placeholder, value, onChange, stops, labels, marker }: Props) {
  const { lang, t } = useLang();
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => (open ? matchStops(query, stops, lang) : []), [open, query, stops, lang]);
  const selectedLabel = value ? (labels.get(value) ?? "") : "";

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      else setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && open && results[active]) {
      e.preventDefault();
      choose(results[active].id);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="relative">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-brand-700">{label}</span>
        <span className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-brand-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-brand-200">
          <span
            aria-hidden
            className={
              marker === "from"
                ? "h-3 w-3 shrink-0 rounded-full border-[3px] border-brand-600 bg-white"
                : "h-3 w-3 shrink-0 rounded-sm bg-rose-600"
            }
          />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && results[active] ? `${uid}-opt-${active}` : undefined}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            value={open ? query : selectedLabel}
            placeholder={selectedLabel || placeholder}
            onFocus={() => {
              setOpen(true);
              setQuery("");
              setActive(0);
            }}
            onBlur={() => setOpen(false)}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-slate-500"
          />
          {value && (
            <button
              type="button"
              aria-label={`${t("clear")}: ${label}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange("");
                setQuery("");
                inputRef.current?.focus();
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-200"
            >
              ✕
            </button>
          )}
        </span>
      </label>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500">{t("noMatch", { q: query })}</li>
          ) : (
            results.map((s, i) => (
              <li
                key={s.id}
                id={`${uid}-opt-${i}`}
                role="option"
                aria-selected={s.id === value}
                // mousedown (not click) so the input keeps focus and blur doesn't close the list first
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(s.id);
                }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-4 py-2.5 text-base ${
                  i === active ? "bg-brand-50 text-brand-900" : ""
                } ${s.id === value ? "font-semibold" : ""}`}
              >
                {labels.get(s.id)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
