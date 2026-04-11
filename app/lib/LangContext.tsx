import { createContext, useContext, useState, useCallback } from 'react';
import type { ReactNode } from 'react';

export type Lang = 'ja' | 'en';

interface LangContextValue {
  lang: Lang;
  toggleLang: () => void;
}

const LangContext = createContext<LangContextValue>({ lang: 'ja', toggleLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('ja');
  const toggleLang = useCallback(() => setLang(l => l === 'ja' ? 'en' : 'ja'), []);
  return <LangContext.Provider value={{ lang, toggleLang }}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}
