// components/ClientLangUpdater.tsx
"use client";

import { useEffect } from "react";
import { useTranslation } from "@/context/i18nContext";

export const ClientLangUpdater = () => {
  const { locale } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
};
