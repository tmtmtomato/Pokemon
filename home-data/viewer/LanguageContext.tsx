/**
 * Lightweight language context for the meta viewer.
 *
 * Provides a single source of truth for the current UI language (`ja` or
 * `en`) and persists the user's choice to `localStorage` so reloading the
 * standalone HTML keeps the same view. The provider also exposes a setter
 * and a convenience toggle so the toolbar button can flip between the two
 * options without re-implementing the persistence logic.
 *
 * Components consume the context through the `useLang()` hook and pass
 * the resulting `lang` value to the localize* helpers in `./i18n.ts`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Lang } from "./i18n";

interface LanguageContextValue {
  lang: Lang;
  setLang: (next: Lang) => void;
  toggleLang: () => void;
}

const STORAGE_KEY = "champions-meta-viewer:lang";

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

function readInitialLang(): Lang {
  if (typeof window === "undefined") return "ja";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "ja") return saved;
  } catch {
    // localStorage may be unavailable in restricted contexts; ignore.
  }
  return "ja";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readInitialLang);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore storage failures (private mode, sandboxed file://, etc.).
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);
  const toggleLang = useCallback(
    () => setLangState((prev) => (prev === "ja" ? "en" : "ja")),
    [],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({ lang, setLang, toggleLang }),
    [lang, setLang, toggleLang],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLang must be used inside <LanguageProvider>");
  }
  return ctx;
}
