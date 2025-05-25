// components/features/AmenityNameSearchInput.tsx
"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { useDebouncedCallback } from "use-debounce"; // Optional: debounce if filtering is heavy

// This will be similar to LocationSearchInput but simpler, as it only updates a store value for client-side filtering – no API calls for suggestions from this specific input.
export function AmenityNameSearchInput() {
  const { amenityNameQuery, setAmenityNameQuery } = useAppStore();

  // Optional: Debounce if you have thousands of markers and filtering is slow
  const debouncedSetAmenityNameQuery = useDebouncedCallback(
    (query: string) => {
      setAmenityNameQuery(query);
    },
    300 // 300ms debounce
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // If using debounce:
    debouncedSetAmenityNameQuery(event.target.value);
    // If not using debounce:
    // setAmenityNameQuery(event.target.value);
  };

  const handleClearSearch = () => {
    // If using debounce:
    debouncedSetAmenityNameQuery.cancel();
    setAmenityNameQuery(""); // Set immediately
    // If not using debounce:
    // setAmenityNameQuery("");
  };

  return (
    <div className="relative w-full sm:max-w-xs">
      {" "}
      {/* Adjust max-width as needed */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search name in current view..."
          value={amenityNameQuery} // Controlled input
          onChange={handleInputChange}
          className="pl-10 pr-10 w-full"
        />
        {amenityNameQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={handleClearSearch}
            title="Clear name search"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
