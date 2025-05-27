// components/features/LanguagePicker.tsx
"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  // SelectValue, // We'll use this for the displayed value
} from "@/components/ui/select";
import { useTranslation } from "@/context/i18nContext";
import { locales, Locale } from "@/locales";
import { LanguagesIcon } from "lucide-react";

export function LanguagePicker() {
  const { locale, setLocale, t } = useTranslation();

  const handleLocaleChange = (newLocale: Locale) => {
    setLocale(newLocale);
  };

  // Use translated labels for the select options if available
  // Fallback to simple names if translation keys aren't set up yet
  const getLocaleLabel = (locKey: Locale): string => {
    if (locKey === "en") return t("languages.en", { defaultValue: "English" });
    if (locKey === "bhs") return t("languages.bhs", { defaultValue: "BHS" });
    return (locKey as string).toUpperCase();
  };

  return (
    <Select
      value={locale}
      onValueChange={(value) => handleLocaleChange(value as Locale)}
    >
      <SelectTrigger
        className="w-auto h-9 px-2 sm:h-10 sm:px-3"
        // Using defaultValue in t() for aria-label is a good fallback
        aria-label={t("languagePicker.ariaLabel", {
          defaultValue: "Change language",
        })}
      >
        <div className="flex items-center gap-2">
          <LanguagesIcon className="h-4 w-4" />
          {/* Display the translated name of the currently selected locale */}
          <span className="hidden sm:inline">{getLocaleLabel(locale)}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {locales.map((locKey) => (
          <SelectItem key={locKey} value={locKey}>
            {getLocaleLabel(locKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
