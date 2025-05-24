// components/features/LocationSearchInput.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card"; // For suggestion list
import { Loader2, MapPin, Search, X } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { GeocodingResult } from "@/lib/types";
import { useDebouncedCallback } from "use-debounce";
import { toast } from "sonner";

export function LocationSearchInput() {
  const {
    searchQuery,
    setSearchQuery,
    geocodingResults,
    setGeocodingResults,
    setSelectedLocation,
    selectedLocation,
  } = useAppStore();

  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (query.trim().length < 3) {
        // Minimum query length for search
        setGeocodingResults([]);
        setShowSuggestions(false);
        return;
      }
      setIsLoadingSuggestions(true);
      setShowSuggestions(true); // Show suggestion box (even if it's just a loading state)
      console.log(
        "LocationSearchInput: Fetching suggestions for query:",
        query,
        "URL:",
        `/api/geocode?q=${encodeURIComponent(query)}`
      );

      try {
        const response = await fetch(
          `/api/geocode?q=${encodeURIComponent(query)}`
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || "Failed to fetch suggestions");
        }
        const data: GeocodingResult[] = await response.json();
        setGeocodingResults(data);
      } catch (error: any) {
        console.error("Error fetching geocoding suggestions:", error);
        toast.error(`Search error: ${error.message}`);
        setGeocodingResults([]);
      } finally {
        setIsLoadingSuggestions(false);
      }
    },
    [setGeocodingResults]
  );

  const debouncedFetchSuggestions = useDebouncedCallback(fetchSuggestions, 500); // 500ms debounce

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setSearchQuery(query);
    if (query.trim().length >= 3) {
      debouncedFetchSuggestions(query);
    } else {
      setGeocodingResults([]);
      setShowSuggestions(false);
      debouncedFetchSuggestions.cancel(); // Cancel any pending debounced calls
    }
  };

  const handleSuggestionClick = (location: GeocodingResult) => {
    setSelectedLocation(location); // This will also set searchQuery via store logic
    setGeocodingResults([]);
    setShowSuggestions(false);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    setGeocodingResults([]);
    setSelectedLocation(null); // Clear selected location as well
    setShowSuggestions(false);
    debouncedFetchSuggestions.cancel();
  };

  // Effect to hide suggestions if user clicks outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showSuggestions && !target.closest(".location-search-container")) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showSuggestions]);

  // Update input field if selectedLocation is set externally (e.g. "My Location")
  useEffect(() => {
    if (selectedLocation && selectedLocation.display_name !== searchQuery) {
      setSearchQuery(selectedLocation.display_name);
    }
  }, [selectedLocation, searchQuery, setSearchQuery]);

  return (
    <div className="relative location-search-container w-full max-w-md">
      {" "}
      {/* Added w-full and max-w-md */}
      <div className="relative flex items-center">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search city or town..."
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={() =>
            searchQuery.trim().length >= 3 && fetchSuggestions(searchQuery)
          } // Show suggestions on focus if query is valid
          className="pl-10 pr-10 w-full" // Added w-full
        />
        {searchQuery && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
            onClick={handleClearSearch}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {showSuggestions && (
        <Card className="absolute z-50 mt-1 w-full shadow-lg max-h-60 overflow-y-auto">
          {" "}
          {/* Ensure dropdown is above map */}
          <CardContent className="p-2">
            {isLoadingSuggestions && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2">Searching...</span>
              </div>
            )}
            {!isLoadingSuggestions &&
              geocodingResults.length === 0 &&
              searchQuery.trim().length >= 3 && (
                <p className="p-4 text-sm text-center text-muted-foreground">
                  No results found for "{searchQuery}".
                </p>
              )}
            {!isLoadingSuggestions &&
              geocodingResults.map((location) => (
                <div
                  key={location.place_id}
                  className="flex items-center p-2 hover:bg-accent rounded-md cursor-pointer"
                  onClick={() => handleSuggestionClick(location)}
                >
                  <MapPin className="h-4 w-4 mr-2 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">
                    {location.display_name}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
