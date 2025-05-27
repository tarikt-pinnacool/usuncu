// context/i18nContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { Locale, defaultLocale, locales } from "@/locales"; // Path to your locales/index.ts
import enTranslations from "@/locales/en.json";
import bhsTranslations from "@/locales/bhs.json";

// Define the shape of your translation files
// You can make this more specific if you know all top-level keys
type Translations = Record<string, any>;

const translations: Record<Locale, Translations> = {
  en: enTranslations,
  bhs: bhsTranslations,
};

interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, options?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [locale, _setLocale] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      const storedLocale = localStorage.getItem("usuncu-locale") as Locale;
      return storedLocale && locales.includes(storedLocale)
        ? storedLocale
        : defaultLocale;
    }
    return defaultLocale;
  });

  useEffect(() => {
    // Effect to initialize locale from localStorage on client mount
    // This handles the case where localStorage is accessed after initial render
    const storedLocale = localStorage.getItem("usuncu-locale") as Locale;
    if (
      storedLocale &&
      locales.includes(storedLocale) &&
      storedLocale !== locale
    ) {
      _setLocale(storedLocale);
    }
  }, [locale]); // Re-run if locale changes, though it shouldn't change itself here.

  const setLocale = (newLocale: Locale) => {
    if (locales.includes(newLocale)) {
      localStorage.setItem("usuncu-locale", newLocale);
      _setLocale(newLocale);
    }
  };

  const t = useCallback(
    (key: string, options?: Record<string, string | number>): string => {
      const keyParts = key.split(".");
      let currentPath: any = translations[locale]; // Use 'any' for traversal, then check type

      for (const part of keyParts) {
        if (
          currentPath &&
          typeof currentPath === "object" &&
          part in currentPath
        ) {
          currentPath = currentPath[part];
        } else {
          console.warn(
            `Translation key "${key}" not found for locale "${locale}"`
          );
          return options?.defaultValue?.toString() || key; // Allow a defaultValue option
        }
      }

      if (typeof currentPath === "string") {
        let resultString = currentPath;
        if (options) {
          resultString = Object.entries(options).reduce(
            (accString: string, [optKey, optValue]) => {
              // Explicitly type accString
              if (optKey === "defaultValue") return accString; // Skip defaultValue in replacements
              return accString.replace(
                new RegExp(`{{${optKey}}}`, "g"),
                String(optValue)
              );
            },
            resultString // Initial value for reduce
          );
        }
        return resultString;
      }

      // If the path resolved to something other than a string (e.g., an object of nested keys)
      console.warn(
        `Translation key "${key}" resolved to a non-string value for locale "${locale}"`
      );
      return options?.defaultValue?.toString() || key;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useTranslation = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error("useTranslation must be used within an I18nProvider");
  }
  return context;
};
