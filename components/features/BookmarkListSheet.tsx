// components/features/BookmarkListSheet.tsx
"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Bookmark, MapPin, Trash2 } from "lucide-react"; // Removed ExternalLink as it wasn't used
import { useAppStore } from "@/store/appStore";
import { Place } from "@/lib/types";
import { toast } from "sonner";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { BellRing, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Switch } from "@radix-ui/react-switch";
import { Label } from "@radix-ui/react-label";

export function BookmarkListSheet() {
  const {
    bookmarks,
    places, // Corrected: use 'places' from the store
    removeBookmark,
    processAndSetNewLocation,
    isBookmarkSheetOpen,
    setIsBookmarkSheetOpen,
  } = useAppStore();

  const { permission, requestPermission } = useNotificationPermission();
  const [sunAlertsEnabled, setSunAlertsEnabled] = useState(false);

  // On component mount, check if permission was previously granted for sun alerts
  useEffect(() => {
    if (
      permission === "granted" &&
      localStorage.getItem("sunAlertsEnabled") === "true"
    ) {
      setSunAlertsEnabled(true);
    }
  }, [permission]);

  const handleToggleSunAlerts = async () => {
    if (!sunAlertsEnabled) {
      // Trying to enable
      if (permission !== "granted") {
        const granted = await requestPermission();
        if (!granted) return; // Permission not granted, do nothing further
      }
      setSunAlertsEnabled(true);
      localStorage.setItem("sunAlertsEnabled", "true");
      toast.success("Sun alerts for bookmarks enabled!");
    } else {
      // Trying to disable
      setSunAlertsEnabled(false);
      localStorage.setItem("sunAlertsEnabled", "false");
      toast.info("Sun alerts for bookmarks disabled.");
    }
  };

  // Find bookmarked place details from the 'places' array
  const bookmarkedPlacesDetails: Place[] = bookmarks
    .map((bookmarkId) => places.find((p) => p.id === bookmarkId)) // p is inferred as Place from places array
    .filter((place: Place | undefined): place is Place => place !== undefined); // Explicitly type 'place' and use type guard

  const handleGoToPlace = (place: Place) => {
    if (place.center) {
      const locationData = {
        lat: place.center.lat,
        lng: place.center.lng,
        displayName: place.name || "Bookmarked Place",
      };
      processAndSetNewLocation(locationData, false);
      toast.info(`Panning to ${place.name || "bookmarked spot"}`);
    }
  };

  return (
    <Sheet open={isBookmarkSheetOpen} onOpenChange={setIsBookmarkSheetOpen}>
      <SheetTrigger asChild onClick={() => setIsBookmarkSheetOpen(true)}>
        <Button variant="outline" size="icon" title="View Bookmarks">
          <Bookmark className="h-5 w-5" />
          {bookmarks.length > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
              {bookmarks.length}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[350px] sm:w-[450px] flex flex-col z-[1000]">
        <SheetHeader>
          <SheetTitle>My Bookmarked Spots</SheetTitle>
          <SheetDescription>
            Your favorite sunny (or shady) places. Click to view on map.
          </SheetDescription>
          <div className="mt-4 p-3 border-t flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <BellRing
                className={`h-5 w-5 ${
                  sunAlertsEnabled && permission === "granted"
                    ? "text-green-500"
                    : "text-muted-foreground"
                }`}
              />
              <Label htmlFor="sun-alerts-toggle" className="text-sm">
                Enable Sun Alerts
              </Label>
            </div>
            <Switch
              id="sun-alerts-toggle"
              checked={sunAlertsEnabled && permission === "granted"}
              onCheckedChange={handleToggleSunAlerts}
              disabled={permission === "denied"} // Disable if permission is hard denied
            />
          </div>
          {permission === "denied" && (
            <p className="text-xs text-destructive">
              Notifications blocked by browser.
            </p>
          )}
        </SheetHeader>
        {bookmarkedPlacesDetails.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Bookmark className="h-16 w-16 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              You haven't bookmarked any spots yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Find a spot on the map and click the star in its popup!
            </p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-2">
            {bookmarkedPlacesDetails.map((place) => (
              <div
                key={place.id}
                className="p-3 border rounded-lg hover:bg-accent/50"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-semibold text-sm">
                      {place.name || "Unnamed Place"}
                    </h4>
                    <p className="text-xs text-muted-foreground capitalize">
                      {place.tags?.amenity?.replace(/_/g, " ") || "Place"}
                    </p>
                  </div>
                  <SheetClose asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Go to place"
                      onClick={() => handleGoToPlace(place)}
                    >
                      <MapPin className="h-4 w-4" />
                    </Button>
                  </SheetClose>
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/90 h-7 px-2"
                    onClick={() => {
                      removeBookmark(place.id);
                      toast.success(
                        `"${place.name || "Place"}" removed from bookmarks.`
                      );
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <SheetFooter className="mt-auto pt-4 border-t">
          <SheetClose asChild>
            <Button variant="outline">Close</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
