// components/features/AmenityNameSearchInput.tsx
"use client";

import React, { useState, useEffect, useRef } from "react"; // Added useRef
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, X } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { useDebouncedCallback } from "use-debounce";

export function AmenityNameSearchInput() {
  const globalAmenityNameQuery = useAppStore((state) => state.amenityNameQuery);
  const setGlobalAmenityNameQuery = useAppStore(
    (state) => state.setAmenityNameQuery
  );

  // Local state for the input field's value, for responsive typing
  const [localQuery, setLocalQuery] = useState(globalAmenityNameQuery);

  // Ref to track if the change to localQuery originated from an external globalQuery update
  // This helps prevent the debounced function from firing when we're just syncing.
  const isSyncingRef = useRef(false);

  const debouncedSetGlobalQuery = useDebouncedCallback(
    (query: string) => {
      // ("AmenityNameSearchInput: Debounced - Setting global query to:", query);
      setGlobalAmenityNameQuery(query);
    },
    300 // 300ms debounce
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = event.target.value;
    // ("AmenityNameSearchInput: Input changed (local):", newQuery);
    setLocalQuery(newQuery); // Update local state immediately for responsive input

    // Ensure we don't trigger debounce if this change was due to syncing from global
    if (!isSyncingRef.current) {
      debouncedSetGlobalQuery(newQuery); // Debounce update to global store
    }
    // Reset the flag after handling input, as the next input will be user-driven
    isSyncingRef.current = false;
  };

  const handleClearSearch = () => {
    // ("AmenityNameSearchInput: Clearing search");
    setLocalQuery(""); // Clear local state immediately
    debouncedSetGlobalQuery.cancel(); // Cancel any pending debounced calls
    setGlobalAmenityNameQuery(""); // Update global store immediately
  };

  // Effect to sync localQuery if globalAmenityNameQuery changes externally
  useEffect(() => {
    // If the global query changes (and it's different from local input),
    // update the local input's value.
    if (globalAmenityNameQuery !== localQuery) {
      // ("AmenityNameSearchInput: Syncing localQuery from global:", globalAmenityNameQuery);
      isSyncingRef.current = true; // Set flag to prevent debounced call from this update
      setLocalQuery(globalAmenityNameQuery);
      // The flag will be reset in handleInputChange, or we can reset it in another effect if needed,
      // but for typing, handleInputChange resetting it is usually fine.
    }
  }, [globalAmenityNameQuery, localQuery]);

  return (
    <div className="relative w-full sm:max-w-xs">
      <div className="relative flex items-center">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search name in current view..."
          value={localQuery} // Controlled by local state
          onChange={handleInputChange}
          className="pl-10 pr-10 w-full"
        />
        {localQuery && ( // Show 'X' based on localQuery
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
