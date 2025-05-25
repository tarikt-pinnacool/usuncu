// components/features/PlaceDetailSheet.tsx
"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/appStore";
import {
  ExternalLink,
  MapPin,
  Sun,
  Moon,
  Star,
  X,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

// Helper to format tags nicely (can be expanded)
const formatTags = (
  tags: Record<string, string>
): { key: string; value: string }[] => {
  const ignoreKeys = [
    "name",
    "amenity",
    "cuisine",
    "addr:street",
    "addr:housenumber",
    "addr:city",
    "addr:postcode",
    "opening_hours",
    "website",
    "phone",
  ];
  return Object.entries(tags)
    .filter(
      ([key]) =>
        !ignoreKeys.some((ik) => key.startsWith(ik)) && !key.startsWith("name:")
    )
    .map(([key, value]) => ({
      key: key.replace(/_/g, " ").replace(/^./, (str) => str.toUpperCase()), // Capitalize and replace underscores
      value: value.replace(/_/g, " "),
    }))
    .slice(0, 10); // Limit number of tags shown for brevity
};

export function PlaceDetailSheet() {
  const {
    selectedPlaceDetail,
    setSelectedPlaceDetail,
    bookmarks,
    addBookmark,
    removeBookmark,
    setIsBookmarkSheetOpen, // To close bookmark sheet if this opens
  } = useAppStore();

  if (!selectedPlaceDetail) {
    return null; // Don't render anything if no place is selected
  }

  const place = selectedPlaceDetail;
  const isBookmarked = bookmarks.includes(place.id);
  const displayableTags = formatTags(place.tags);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSelectedPlaceDetail(null); // Clear selected place when sheet is closed
    } else {
      setIsBookmarkSheetOpen(false); // Close bookmark sheet if this one opens
    }
  };

  const handleToggleBookmark = () => {
    if (isBookmarked) {
      removeBookmark(place.id);
      toast.success(`"${place.name || "Place"}" removed from bookmarks.`);
    } else {
      addBookmark(place.id);
      toast.success(`"${place.name || "Place"}" added to bookmarks!`);
    }
  };

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.center.lat},${place.center.lng}`;

  return (
    <Sheet open={!!selectedPlaceDetail} onOpenChange={handleOpenChange}>
      <SheetContent className="w-[350px] sm:w-[450px] flex flex-col z-[1000]">
        {" "}
        {/* Remove default padding for custom layout */}
        <SheetHeader className="p-6 pb-4 border-b">
          <div className="flex justify-between items-start">
            <SheetTitle className="text-xl font-bold mr-2 break-words">
              {place.name || "Unnamed Place"}
            </SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon" className="-mt-1 -mr-1">
                <X className="h-5 w-5" />
              </Button>
            </SheetClose>
          </div>
          <SheetDescription className="capitalize text-sm">
            {place.tags?.amenity?.replace(/_/g, " ") || "Place details"}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Sun/Shade Status */}
          <div
            className={`p-3 rounded-md flex items-center space-x-3 ${
              place.isInSun
                ? "bg-amber-100 dark:bg-amber-800/30"
                : "bg-slate-100 dark:bg-slate-800/50"
            }`}
          >
            {place.isInSun === null ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : place.isInSun ? (
              <Sun className="h-6 w-6 text-orange-500" />
            ) : (
              <Moon className="h-6 w-6 text-slate-500" />
            )}
            <span className="font-medium">
              Currently:{" "}
              {place.isInSun === null
                ? "Checking status..."
                : place.isInSun
                ? "In the Sun"
                : "In the Shade"}
            </span>
          </div>

          {/* Address */}
          {(place.tags?.["addr:street"] || place.tags?.["addr:city"]) && (
            <div>
              <h4 className="text-sm font-semibold mb-1">Address</h4>
              <p className="text-sm text-muted-foreground">
                {place.tags["addr:street"] || ""}{" "}
                {place.tags["addr:housenumber"] || ""}
                {place.tags["addr:street"] && place.tags["addr:city"]
                  ? ", "
                  : ""}
                {place.tags["addr:city"] || ""}{" "}
                {place.tags["addr:postcode"] || ""}
              </p>
            </div>
          )}

          {/* Cuisine */}
          {place.tags?.cuisine && (
            <div>
              <h4 className="text-sm font-semibold mb-1">Cuisine</h4>
              <p className="text-sm text-muted-foreground capitalize">
                {place.tags.cuisine.replace(/_/g, " ")}
              </p>
            </div>
          )}

          {/* Other Tags */}
          {displayableTags.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold mb-1">More Info</h4>
              <ul className="list-disc list-inside space-y-0.5 text-sm text-muted-foreground">
                {displayableTags.map((tag) => (
                  <li key={tag.key}>
                    <span className="font-medium">{tag.key}:</span> {tag.value}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Website & Phone (Example) */}
          {place.tags?.website && (
            <Button variant="link" asChild className="p-0 h-auto text-sm">
              <a
                href={
                  place.tags.website.startsWith("http")
                    ? place.tags.website
                    : `http://${place.tags.website}`
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit Website <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
        <SheetFooter className="p-4 border-t flex flex-col sm:flex-row gap-2 justify-end">
          <Button variant="outline" asChild>
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
              <MapPin className="h-4 w-4 mr-2" /> Get Directions
            </a>
          </Button>
          <Button
            onClick={handleToggleBookmark}
            variant={isBookmarked ? "secondary" : "default"}
          >
            <Star
              className={`h-4 w-4 mr-2 ${isBookmarked ? "fill-current" : ""}`}
            />
            {isBookmarked ? "Bookmarked" : "Bookmark"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
