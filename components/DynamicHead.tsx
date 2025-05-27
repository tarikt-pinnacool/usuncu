"use client";

import { useEffect } from "react";
import { useTranslation } from "@/context/i18nContext";

export function DynamicHead() {
  const { t } = useTranslation();

  useEffect(() => {
    document.title = t("layout.title");
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute("content", t("layout.description"));
    } else {
      const meta = document.createElement("meta");
      meta.name = "description";
      meta.content = t("layout.description");
      document.head.appendChild(meta);
    }
  }, [t]);

  return null;
}
