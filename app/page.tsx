// app/page.tsx
"use client";
import { useEffect } from "react";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { LocationSearchInput } from "@/components/features/LocationSearchInput";
import { Button } from "@/components/ui/button";
import { Loader2, LocateFixedIcon, RefreshCw, SearchX } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Place, Building, BoundingBox } from "@/lib/types"; // BoundingBox
import { useCurrentTime } from "@/hooks/useCurrentTime";
import { useUserLocation } from "@/hooks/useUserLocation";
import { BookmarkListSheet } from "@/components/features/BookmarkListSheet";
import { useSunAlerts } from "@/hooks/useSunAlerts"; // Import
import { PlaceDetailSheet } from "@/components/features/PlaceDetailsSheet";
import { FilterPanelSheet } from "@/components/features/FilterPanelSheet"; // IMPORT NEW

const MapComponentWithNoSSR = dynamic(
  () => import("@/components/map/MapComponent"),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
);

// Fetch function for TanStack Query using BoundingBox
const fetchOsmDataWithBounds = async (
  bounds: BoundingBox | null
): Promise<{ places: Place[]; buildings: Building[] }> => {
  if (!bounds) {
    // console.log("fetchOsmDataWithBounds: No bounds provided, returning empty.");
    return { places: [], buildings: [] };
  }
  const bboxStr = bounds.join(","); // S,W,N,E
  // console.log(`fetchOsmDataWithBounds: Fetching for bbox: ${bboxStr}`);
  const response = await fetch(`/api/osm?bbox=${bboxStr}`); // API will need to accept bbox
  if (!response.ok) {
    const errorData = await response.json();
    console.error("fetchOsmDataWithBounds: API error", errorData);
    throw new Error(
      errorData.details || `Failed to fetch OSM data: ${response.status}`
    );
  }
  const data = await response.json();
  // console.log(`fetchOsmDataWithBounds: Received ${data.places?.length} places, ${data.buildings?.length} buildings.`);
  return data;
};

export default function HomePage() {
  const {
    mapBoundsForQuery,
    mapZoom,
    mapRef,
    setPlaces,
    setBuildings,
    selectedLocation,
    userCoordinates,
    isBookmarkSheetOpen,
    hasMapMoved,
    setHasMapMoved,
    setMapBoundsForQuery,
  } = useAppStore();

  useCurrentTime(60000);
  const { requestUserLocation } = useUserLocation();

  useSunAlerts();

  const MIN_FETCH_ZOOM_LEVEL = 14; // Define your minimum zoom level

  const queryKeyForOsmData = mapBoundsForQuery
    ? (["osmData", mapBoundsForQuery, mapZoom] as const)
    : (["osmData", "disabled_bounds", mapZoom] as const); // Use a placeholder if bounds are null

  const queryResult = useQuery<
    { places: Place[]; buildings: Building[] },
    Error,
    { places: Place[]; buildings: Building[] },
    // The key will be [string, BoundingBox | string, number]
    // Or more precisely for when it's enabled: [string, BoundingBox, number]
    // Or for when it's disabled: [string, string, number]
    // Tanstack query is flexible, let's use a union for the key type for now
    readonly [string, BoundingBox, number] | readonly [string, string, number]
  >({
    queryKey: queryKeyForOsmData,
    queryFn: () => fetchOsmDataWithBounds(mapBoundsForQuery), // fetchOsmDataWithBounds handles null bounds
    enabled: !!mapBoundsForQuery && mapZoom >= MIN_FETCH_ZOOM_LEVEL,
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: osmData,
    isLoading: isLoadingOsmData,
    isError,
    error,
    isSuccess,
  } = queryResult;

  // Handle TanStack Query success
  useEffect(() => {
    if (isSuccess && osmData) {
      setPlaces(osmData.places || []);
      setBuildings(osmData.buildings || []);
      if (
        osmData.places &&
        osmData.places.length === 0 &&
        mapBoundsForQuery &&
        mapZoom >= MIN_FETCH_ZOOM_LEVEL
      ) {
        const locationName =
          selectedLocation?.display_name ||
          (userCoordinates ? "your current area" : "the selected area");
        toast.info(
          `No places found for ${locationName} at this zoom level. The map data might be incomplete.`
        );
      }
    }
  }, [
    isSuccess,
    osmData,
    setPlaces,
    setBuildings,
    mapBoundsForQuery,
    selectedLocation,
    userCoordinates,
    mapZoom,
  ]);

  // Handle TanStack Query error
  useEffect(() => {
    if (isError && error) {
      console.error("HomePage EFFECT TQ Error:", error);
      toast.error(`Failed to load places: ${error.message}`);
      setPlaces([]);
      setBuildings([]);
    }
  }, [isError, error, setPlaces, setBuildings]);

  // Initial location request on mount or if all location info is cleared
  useEffect(() => {
    if (!selectedLocation && !userCoordinates) {
      // console.log("HomePage EFFECT: Requesting user location on initial mount / no location set.");
      requestUserLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation, userCoordinates]); // Re-check if selectedLocation or userCoordinates become null

  const handleSearchThisArea = () => {
    if (mapRef && mapZoom >= MIN_FETCH_ZOOM_LEVEL) {
      const currentMapBounds = mapRef.getBounds();
      const newBounds: BoundingBox = [
        currentMapBounds.getSouth(),
        currentMapBounds.getWest(),
        currentMapBounds.getNorth(),
        currentMapBounds.getEast(),
      ];
      // console.log("HomePage: 'Search This Area' clicked. New bounds:", newBounds);
      setMapBoundsForQuery(newBounds); // This will trigger TanStack Query
      setHasMapMoved(false); // Reset the flag
    } else if (mapZoom < MIN_FETCH_ZOOM_LEVEL) {
      toast.info(
        `Please zoom in to at least level ${MIN_FETCH_ZOOM_LEVEL} to search this area.`
      );
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <header className="p-3 border-b flex flex-col sm:flex-row items-center gap-3 sm:gap-4 bg-background shadow-sm relative z-30">
        {/* Top Row: Logo & Theme/Location Buttons */}
        <div className="w-full flex justify-between items-center">
          <div className="flex-shrink-0">
            <h1 className="text-xl font-semibold truncate">
              <img
                src="/logo_transparent.png"
                alt="Usuncu Logo"
                className="h-8 inline-block"
              />
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            {" "}
            {/* Keep z-index here if needed for dropdowns inside these, e.g. ThemeToggle */}
            <BookmarkListSheet />
            <Button
              variant="outline"
              size="icon"
              onClick={requestUserLocation}
              title="Use my current location"
            >
              <LocateFixedIcon className="h-5 w-5" />
            </Button>
            <ThemeToggleButton />
          </div>
        </div>

        {/* Bottom Row: Location Search & Main Filter Trigger */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 items-center gap-3 sm:gap-4 pt-2 sm:pt-0">
          <div className="md:col-span-1 w-full">
            {" "}
            {/* Location Search - ensure it can take full width on small screens */}
            <LocationSearchInput />
          </div>
          <div className="md:col-span-1 flex md:justify-end w-full md:w-auto">
            {" "}
            {/* Filter Panel Trigger */}
            <FilterPanelSheet />
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        {/* Parent for map and potential side elements */}
        <main
          className={
            "flex-1 relative transition-all duration-300 ease-in-out mr-0"
          }
        >
          {isLoadingOsmData && mapZoom >= MIN_FETCH_ZOOM_LEVEL && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-20 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-lg text-muted-foreground">
                Finding sunny spots near{" "}
                {selectedLocation?.display_name || "your current area"}...
              </p>
            </div>
          )}
          {mapZoom < MIN_FETCH_ZOOM_LEVEL && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-destructive/90 text-destructive-foreground p-3 rounded-md shadow-lg z-20 text-sm">
              <p>
                Please zoom in further (current zoom: {mapZoom.toFixed(0)}) to
                load places.
              </p>
            </div>
          )}
          {!isLoadingOsmData &&
            isSuccess &&
            osmData?.places?.length === 0 &&
            mapBoundsForQuery &&
            mapZoom >= MIN_FETCH_ZOOM_LEVEL && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 z-10 pointer-events-none">
                {" "}
                {/* pointer-events-none so map is still interactive underneath */}
                <div className="bg-background/90 p-6 rounded-lg shadow-xl">
                  <SearchX className="h-16 w-16 mx-auto text-muted-foreground mb-4" />{" "}
                  {/* New icon from lucide-react */}
                  <h3 className="text-xl font-semibold mb-2">No Spots Found</h3>
                  <p className="text-muted-foreground">
                    We couldn't find any listed cafes, restaurants, or bars in
                    this specific map area.
                    <br />
                    Try zooming out, panning to a different location, or
                    searching for another area.
                  </p>
                  <p className="text-xs text-muted-foreground mt-4">
                    (Data from OpenStreetMap. Accuracy may vary.)
                  </p>
                </div>
              </div>
            )}
          {/* "Search This Area" Button */}
          {hasMapMoved && mapZoom >= MIN_FETCH_ZOOM_LEVEL && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-1000">
              <Button
                onClick={handleSearchThisArea}
                variant="secondary"
                className="shadow-lg"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Search This Area
              </Button>
            </div>
          )}
          <MapComponentWithNoSSR />
        </main>
      </div>
      <footer className="p-2 border-t text-center text-xs text-muted-foreground bg-background">
        <PlaceDetailSheet />
        Map data ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-primary"
        >
          OpenStreetMap
        </a>{" "}
        contributors. Usuncu App - Find your spot in the sun (or shade)!
      </footer>
    </div>
  );
}
