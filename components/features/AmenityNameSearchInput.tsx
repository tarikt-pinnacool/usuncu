// components/features/AmenityNameSearchInput.tsx
"use client";

import React, { useState, useEffect, useRef } from "react";
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

  // Local state for the input field's value.
  // Initialize with the global value.
  const [localQuery, setLocalQuery] = useState(globalAmenityNameQuery);

  // Ref to signal if the next globalAmenityNameQuery update is from *this* component's debounce.
  // This prevents the useEffect from immediately reverting local state during active typing.
  const isInternalUpdateRef = useRef(false);

  // Debounced function to update the global store.
  // It sets the flag *before* dispatching the global update.
  const debouncedSetGlobalQuery = useDebouncedCallback(
    (query: string) => {
      isInternalUpdateRef.current = true; // Mark that this update originates from here
      setGlobalAmenityNameQuery(query);
    },
    300 // 300ms debounce
  );

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = event.target.value;
    setLocalQuery(newQuery); // Update local state immediately for responsive input
    debouncedSetGlobalQuery(newQuery); // Schedule global state update via debounce
  };

  const handleClearSearch = () => {
    setLocalQuery(""); // Clear local state immediately
    debouncedSetGlobalQuery.cancel(); // Cancel any pending debounced calls
    setGlobalAmenityNameQuery(""); // Update global store immediately (this is an immediate, intentional action)
    // No need to set isInternalUpdateRef.current = true here, as the direct global update
    // will be caught by the useEffect's check (globalAmenityNameQuery !== localQuery)
    // and correctly reset localQuery, but it won't be prevented by the flag.
    // If the clear button is meant to be the *only* external way to reset, then maybe.
    // But for simplicity, let it pass through.
  };

  // Effect to sync localQuery if globalAmenityNameQuery changes
  // This effect should only react to changes in `globalAmenityNameQuery`.
  useEffect(() => {
    // Check if the global query is different from the current local input.
    // And ensure this change *did not* originate from our own debounced update.
    if (globalAmenityNameQuery !== localQuery) {
      if (!isInternalUpdateRef.current) {
        // If it's an external change, update local state and cancel any pending debounced calls.
        setLocalQuery(globalAmenityNameQuery);
        debouncedSetGlobalQuery.cancel();
      }
    }
    // IMPORTANT: Reset the flag after the effect runs.
    // This prepares it for the *next* internal debounced update.
    isInternalUpdateRef.current = false;
  }, [globalAmenityNameQuery, debouncedSetGlobalQuery]); // Crucially, `localQuery` is NOT a dependency here.

  // The `useState` initialization ensures that `localQuery` is correctly set
  // when the component first mounts, reflecting the initial global state.
  useEffect(() => {
    // This effect runs only once on mount to ensure localQuery matches initial global query.
    // It also handles cases where globalAmenityNameQuery might change *before* the component mounts
    // or very early in its lifecycle.
    if (localQuery !== globalAmenityNameQuery) {
      setLocalQuery(globalAmenityNameQuery);
    }
  }, [globalAmenityNameQuery]); // Run this effect when globalAmenityNameQuery changes to sync initial state.

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
