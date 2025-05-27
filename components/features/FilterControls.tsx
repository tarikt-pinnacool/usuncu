// components/features/FilterControls.tsx
"use client";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Sun, Moon, ListFilter } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { Label } from "@/components/ui/label"; // Optional label
import { useTranslation } from "@/context/i18nContext";

export function FilterControls() {
  const { sunShadeFilter, setSunShadeFilter } = useAppStore();
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center space-y-2">
      <Label
        htmlFor="sun-shade-filter"
        className="text-xs text-muted-foreground sr-only"
      >
        {t("filterControls.label")}
      </Label>
      <ToggleGroup
        id="sun-shade-filter"
        type="single"
        value={sunShadeFilter}
        onValueChange={(value) => {
          if (value) setSunShadeFilter(value as "all" | "sun" | "shade");
        }}
        className="rounded-full border bg-background p-0.5 shadow-sm" // Modern pill shape
        aria-label={t("filterControls.ariaLabel")}
      >
        <ToggleGroupItem
          value="sun"
          aria-label={t("filterControls.sunAria")}
          className="rounded-full px-3 py-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <Sun className="h-4 w-4 mr-1.5" /> {t("filterControls.sun")}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="shade"
          aria-label={t("filterControls.shadeAria")}
          className="rounded-full px-3 py-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <Moon className="h-4 w-4 mr-1.5" /> {t("filterControls.shade")}
        </ToggleGroupItem>
        <ToggleGroupItem
          value="all"
          aria-label={t("filterControls.allAria")}
          className="rounded-full px-3 py-1.5 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          <ListFilter className="h-4 w-4 mr-1.5" /> {t("filterControls.all")}
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
