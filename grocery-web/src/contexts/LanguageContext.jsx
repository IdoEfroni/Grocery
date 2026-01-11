import { createContext, useContext, useState, useEffect } from 'react';
import enTranslations from '../translations/en.json';
import heTranslations from '../translations/he.json';

const LanguageContext = createContext(null);

const translations = {
  en: enTranslations,
  he: heTranslations,
};

const STORAGE_KEY = 'grocery-language';

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    // Load from localStorage or default to 'en'
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && (saved === 'en' || saved === 'he') ? saved : 'en';
  });

  // Save to localStorage whenever language changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, language);
  }, [language]);

  const setLanguage = (lang) => {
    if (lang === 'en' || lang === 'he') {
      setLanguageState(lang);
    }
  };

  // Translation function with nested key support (e.g., 'common.save' or 'browsePage.searchPlaceholder')
  const t = (key, params = {}) => {
    const keys = key.split('.');
    let value = translations[language];
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback to English if key not found
        value = translations.en;
        for (const fallbackKey of keys) {
          if (value && typeof value === 'object' && fallbackKey in value) {
            value = value[fallbackKey];
          } else {
            return key; // Return key if translation not found
          }
        }
        break;
      }
    }

    // Replace parameters in the string (e.g., {name} -> actual name)
    if (typeof value === 'string' && Object.keys(params).length > 0) {
      return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
        return params[paramKey] !== undefined ? params[paramKey] : match;
      });
    }

    return typeof value === 'string' ? value : key;
  };

  // Determine text direction based on language
  const dir = language === 'he' ? 'rtl' : 'ltr';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, dir }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}

