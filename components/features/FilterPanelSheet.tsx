// components/features/FilterPanelSheet.tsx
"use client";

import { useState, useMemo } from "react"; // Added useMemo
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose, // Will use this for list items
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SlidersHorizontal, X, MapPin, Sun, Moon, Star } from "lucide-react"; // Added icons for list
import { AmenityNameSearchInput } from "./AmenityNameSearchInput";
import { FilterControls } from "./FilterControls";
import { useAppStore } from "@/store/appStore";
import { Place } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area"; // For a scrollable list
import { Badge } from "@/components/ui/badge"; // To show sun/shade status

export function FilterPanelSheet() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    processedPlaces, // All places currently processed with sun/shade status
    sunShadeFilter,
    amenityNameQuery,
    setSelectedPlaceDetail, // To open detail sheet from list item
    setIsBookmarkSheetOpen, // To close other sheets
    mapRef, // To pan to the place
    bookmarks, // To show if a place in the list is bookmarked
  } = useAppStore();

  // Memoize the derived list of places to display in the sheet
  const placesToList = useMemo(() => {
    const nameQueryLower = amenityNameQuery.toLowerCase().trim();

    return processedPlaces
      .filter((place) => {
        let passesSunShadeFilter = false;
        if (sunShadeFilter === "all") {
          passesSunShadeFilter = true;
        } else if (place.isInSun !== null && place.isInSun !== undefined) {
          passesSunShadeFilter =
            sunShadeFilter === "sun" ? place.isInSun : !place.isInSun;
        } else {
          passesSunShadeFilter = false; // If status unknown and filter is specific
        }
        if (!passesSunShadeFilter) return false;

        if (nameQueryLower) {
          const placeNameLower = (place.name || "").toLowerCase();
          if (!placeNameLower.includes(nameQueryLower)) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")); // Sort alphabetically by name
  }, [processedPlaces, sunShadeFilter, amenityNameQuery]);

  const handlePlaceListItemClick = (place: Place) => {
    setSelectedPlaceDetail(place);
    setIsBookmarkSheetOpen(false); // Close bookmark sheet
    setIsOpen(false); // Close this filter panel sheet

    // Pan map to the selected place
    if (mapRef && place.relevantShadowPoint) {
      mapRef.flyTo(
        [place.relevantShadowPoint.lat, place.relevantShadowPoint.lng],
        17,
        {
          // Zoom to level 17
          animate: true,
          duration: 0.8,
        }
      );
    } else if (mapRef && place.center) {
      mapRef.flyTo([place.center.lat, place.center.lng], 17);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-9 px-3 sm:h-10 sm:px-4">
          <SlidersHorizontal className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Filters & Results</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[380px] sm:w-[450px] flex flex-col p-0 z-[1050]">
        <SheetHeader className="p-4 sm:p-6 pb-3 border-b">
          <div className="flex justify-between items-center">
            <SheetTitle className="text-lg sm:text-xl">
              Refine & View Results
            </SheetTitle>
            <SheetClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 -mt-2 h-8 w-8 sm:h-9 sm:w-9"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </SheetClose>
          </div>
          <SheetDescription className="text-xs sm:text-sm">
            Filter by name or sun/shade. Click item to view on map & see
            details.
          </SheetDescription>
        </SheetHeader>

        <div className="p-4 sm:p-6 space-y-6 border-b">
          {" "}
          {/* Filters section */}
          <div>
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">
              Search by Name in View
            </h4>
            <AmenityNameSearchInput />
          </div>
          <div className="pt-4">
            <h4 className="text-sm font-medium mb-3 text-muted-foreground">
              Sun / Shade Status
            </h4>
            <FilterControls />
          </div>
        </div>

        {/* List of Filtered Places */}
        <ScrollArea className="flex-1 px-4 sm:px-6 py-4">
          {placesToList.length === 0 && (
            <div className="pt-10 text-center">
              <MapPin className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                No places match your current filters in this map area.
              </p>
            </div>
          )}
          <div className="space-y-3">
            {placesToList.map((place) => {
              const isBookmarked = bookmarks.includes(place.id);
              return (
                <button
                  key={place.id}
                  onClick={() => handlePlaceListItemClick(place)}
                  className="w-full text-left p-3 border rounded-lg hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h5 className="font-semibold text-sm leading-tight">
                        {place.name || "Unnamed Place"}
                      </h5>
                      <p className="text-xs text-muted-foreground capitalize">
                        {place.tags?.amenity?.replace(/_/g, " ") || "Place"}
                      </p>
                    </div>
                    {isBookmarked && (
                      <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 flex-shrink-0" />
                    )}
                  </div>
                  <div className="mt-1.5">
                    {place.isInSun === true && (
                      <Badge
                        variant="default"
                        className="bg-orange-500/80 hover:bg-orange-500 text-white text-xs"
                      >
                        <Sun className="h-3 w-3 mr-1" />
                        Sun
                      </Badge>
                    )}
                    {place.isInSun === false && (
                      <Badge
                        variant="secondary"
                        className="bg-sky-600/80 hover:bg-sky-600 text-white text-xs"
                      >
                        <Moon className="h-3 w-3 mr-1" />
                        Shade
                      </Badge>
                    )}
                    {place.isInSun === null && (
                      <Badge variant="outline" className="text-xs">
                        Checking...
                      </Badge>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
        {/* Footer for sheet, if needed */}
        {/* <SheetFooter className="p-4 border-t">
            <SheetClose asChild><Button variant="outline">Close</Button></SheetClose>
        </SheetFooter> */}
      </SheetContent>
    </Sheet>
  );
}
