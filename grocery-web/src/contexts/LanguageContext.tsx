import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import enTranslations from '../translations/en.json'
import heTranslations from '../translations/he.json'

export type Language = 'en' | 'he'

type TranslationTree = { [key: string]: string | TranslationTree }

const translations: Record<Language, TranslationTree> = {
  en: enTranslations as TranslationTree,
  he: heTranslations as TranslationTree,
}

const STORAGE_KEY = 'grocery-language'

export interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, params?: Record<string, string | number>) => string
  dir: 'ltr' | 'rtl'
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function isLanguage(value: unknown): value is Language {
  return value === 'en' || value === 'he'
}

/** Walks a dot-separated key ('browsePage.scanBarcode') through a tree. */
function lookup(tree: TranslationTree, key: string): string | undefined {
  let node: string | TranslationTree | undefined = tree
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

function readStoredLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isLanguage(saved)) return saved
  } catch {
    // Private mode / blocked storage. Fall through to the default.
  }
  return 'he'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage)

  const dir = language === 'he' ? 'rtl' : 'ltr'

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language)
    } catch {
      // Non-fatal: the choice just will not persist.
    }
  }, [language])

  /**
   * Keep the document element in sync with the chosen language.
   *
   * This is not cosmetic. Native UI the app cannot style -- `alert`/`confirm`
   * dialogs, `<select>` option pickers, form-validation bubbles, the scrollbar
   * gutter and screen-reader voice selection -- all key off `<html lang>` and
   * `<html dir>`, not off a `dir` attribute on some inner div. Hebrew is the
   * default language here, so without this every one of those renders LTR.
   */
  useEffect(() => {
    document.documentElement.lang = language
    document.documentElement.dir = dir
  }, [language, dir])

  const setLanguage = useCallback((lang: Language) => {
    if (isLanguage(lang)) setLanguageState(lang)
  }, [])

  const t = useCallback(
    (key: string, params: Record<string, string | number> = {}) => {
      const value = lookup(translations[language], key) ?? lookup(translations.en, key)
      if (value === undefined) return key

      const paramKeys = Object.keys(params)
      if (paramKeys.length === 0) return value

      return value.replace(/\{(\w+)\}/g, (match, name: string) =>
        params[name] !== undefined ? String(params[name]) : match,
      )
    },
    [language],
  )

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage, t, dir }),
    [language, setLanguage, t, dir],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

// The provider and its hook are deliberately colocated; splitting them to
// satisfy Fast Refresh would churn every import site for a dev-only nicety.
// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
