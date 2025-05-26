// app/page.tsx
"use client";
import { useEffect } from "react";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Button } from "@/components/ui/button";
import { Loader2, LocateFixedIcon, RefreshCw, SearchX } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Place, Building, BoundingBox } from "@/lib/types";
import { useCurrentTime } from "@/hooks/useCurrentTime";
import { useUserLocation } from "@/hooks/useUserLocation";
import { BookmarkListSheet } from "@/components/features/BookmarkListSheet";
import { useSunAlerts } from "@/hooks/useSunAlerts";
import { PlaceDetailSheet } from "@/components/features/PlaceDetailsSheet";
import { FilterPanelSheet } from "@/components/features/FilterPanelSheet";
import Image from "next/image";
import { getUnfetchedAreas, isCoordinateInBbox } from "@/lib/geo";
import * as turf from "@turf/turf";
import { Feature as GeoJsonFeature, Polygon as GeoJsonPolygon } from "geojson";
import TimeSlider from "@/components/features/TimeSlider";

const MapComponentWithNoSSR = dynamic(
  () => import("@/components/map/MapComponent"),
  { ssr: false, loading: () => <Skeleton className="h-full w-full" /> }
);

// Fetch function for TanStack Query that identifies and fetches UNFETCHED areas
const fetchOsmDataForUnfetchedAreas = async (
  currentViewportBounds: BoundingBox,
  fetchedBoundsHistory: BoundingBox[]
): Promise<{
  places: Place[];
  buildings: Building[];
  fetchedBbox: BoundingBox | null;
}> => {
  const unfetchedPolygons = getUnfetchedAreas(
    currentViewportBounds,
    fetchedBoundsHistory
  );

  if (unfetchedPolygons.length === 0) {
    return { places: [], buildings: [], fetchedBbox: null };
  }

  let targetBbox: BoundingBox | null = null;
  let largestArea = 0;

  unfetchedPolygons.forEach((poly: GeoJsonFeature<GeoJsonPolygon>) => {
    const bboxCoords = turf.bbox(poly);
    const area = turf.area(poly);
    if (area > largestArea) {
      largestArea = area;
      targetBbox = [
        bboxCoords[1],
        bboxCoords[0],
        bboxCoords[3],
        bboxCoords[2],
      ] as BoundingBox;
    }
  });

  // If targetBbox is still null here, it means getUnfetchedAreas returned polygons,
  // but for some reason, `turf.bbox` or area calculation might have failed for all of them.
  // This is an edge case, but we should handle it to prevent 'never' type.
  // The `if (!targetBbox)` check at the beginning of the function only covers
  // the case where `unfetchedPolygons.length === 0`.
  // Here, we ensure targetBbox is not null before proceeding.
  if (targetBbox === null) {
    console.warn(
      "No valid target BBox could be determined from unfetched polygons. Skipping fetch."
    );
    return { places: [], buildings: [], fetchedBbox: null };
  }

  const bboxStr = (targetBbox as BoundingBox).join(","); // Now targetBbox is guaranteed to be BoundingBox
  const response = await fetch(`/api/osm?bbox=${bboxStr}`);
  if (!response.ok) {
    const errorData = await response.json();
    console.error("fetchOsmDataForUnfetchedAreas: API error", errorData);
    throw new Error(
      errorData.details || `Failed to fetch OSM data: ${response.status}`
    );
  }
  const data = await response.json();
  return {
    places: data.places || [],
    buildings: data.buildings || [],
    fetchedBbox: targetBbox,
  };
};

export default function HomePage() {
  const {
    mapBoundsForQuery,
    mapZoom,
    mapRef,
    setPlaces,
    setBuildings,
    allFetchedPlaces,
    allFetchedBuildings,
    fetchedBoundsHistory,
    addFetchedOsmData,
    selectedLocation,
    userCoordinates,
    hasMapMoved,
    setHasMapMoved,
    setMapBoundsForQuery,
  } = useAppStore();

  useCurrentTime(60000);
  const { requestUserLocation } = useUserLocation();
  useSunAlerts();

  const MIN_FETCH_ZOOM_LEVEL = 13;

  const queryResult = useQuery<
    { places: Place[]; buildings: Building[]; fetchedBbox: BoundingBox | null },
    Error
  >({
    queryKey: [
      "osmData",
      mapBoundsForQuery,
      JSON.stringify(fetchedBoundsHistory),
    ],
    queryFn: () =>
      fetchOsmDataForUnfetchedAreas(mapBoundsForQuery!, fetchedBoundsHistory),
    enabled: !!mapBoundsForQuery && mapZoom >= MIN_FETCH_ZOOM_LEVEL,
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: newOsmData,
    isLoading: isLoadingOsmData,
    isError,
    error,
    isSuccess,
  } = queryResult;

  useEffect(() => {
    if (isSuccess && newOsmData && newOsmData.fetchedBbox) {
      addFetchedOsmData(
        newOsmData.places || [],
        newOsmData.buildings || [],
        newOsmData.fetchedBbox
      );
      if (newOsmData.places.length === 0 && newOsmData.buildings.length === 0) {
        toast.info(`No new places found in the recently explored area.`);
      }
    }
  }, [isSuccess, newOsmData, addFetchedOsmData]);

  useEffect(() => {
    if (isError && error) {
      console.error("HomePage EFFECT TQ Error:", error);
      toast.error(`Failed to load places: ${error.message}`);
    }
  }, [isError, error]);

  // Derived state logic to filter `allFetchedPlaces` and `allFetchedBuildings`
  useEffect(() => {
    if (!mapBoundsForQuery) {
      setPlaces([]);
      setBuildings([]);
      return;
    }

    const filteredPlaces = allFetchedPlaces.filter(
      (place) =>
        place.center && isCoordinateInBbox(place.center, mapBoundsForQuery)
    );

    const filteredBuildings = allFetchedBuildings.filter(
      (building) =>
        building.center &&
        isCoordinateInBbox(building.center, mapBoundsForQuery)
    );

    setPlaces(filteredPlaces);
    setBuildings(filteredBuildings);
  }, [
    allFetchedPlaces,
    allFetchedBuildings,
    mapBoundsForQuery,
    setPlaces,
    setBuildings,
  ]);

  useEffect(() => {
    if (!selectedLocation && !userCoordinates && !mapBoundsForQuery) {
      requestUserLocation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation, userCoordinates, mapBoundsForQuery]);

  const handleSearchThisArea = () => {
    if (mapRef && mapZoom >= MIN_FETCH_ZOOM_LEVEL) {
      const currentMapBounds = mapRef.getBounds();
      const newBounds: BoundingBox = [
        currentMapBounds.getSouth(),
        currentMapBounds.getWest(),
        currentMapBounds.getNorth(),
        currentMapBounds.getEast(),
      ];
      setMapBoundsForQuery(newBounds);
      setHasMapMoved(false);
    } else if (mapZoom < MIN_FETCH_ZOOM_LEVEL) {
      toast.info(
        `Please zoom in to at least level ${MIN_FETCH_ZOOM_LEVEL} to search this area.`
      );
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden">
      <header className="p-3 border-b flex flex-col items-center gap-3 bg-background shadow-sm relative z-30">
        <div className="w-full flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex-shrink-0 flex items-center">
            <Image
              src="/usuncu-logo.png"
              alt="Usuncu Logo"
              width={36}
              height={38}
              className="h-8 inline-block mr-2"
              priority
            />
            <h1 className="text-xl font-semibold truncate hidden sm:inline">
              Usuncu
            </h1>
          </div>
          {/* Time Slider and Main Controls Area */}
          <div className="flex-grow flex flex-col sm:flex-row items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
            {/* Time Slider Component */}
            <div className="w-full sm:w-auto order-2 sm:order-1">
              <TimeSlider />
            </div>

            {/* Right-aligned controls */}
            <div className="flex items-center space-x-2 order-1 sm:order-2 self-end sm:self-center">
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
              <FilterPanelSheet />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative overflow-hidden">
        <main
          className={
            "flex-1 relative transition-all duration-300 ease-in-out mr-0"
          }
        >
          {isLoadingOsmData &&
            mapBoundsForQuery &&
            mapZoom >= MIN_FETCH_ZOOM_LEVEL && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-20 space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-lg text-muted-foreground">
                  Exploring new areas near{" "}
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
            mapBoundsForQuery &&
            mapZoom >= MIN_FETCH_ZOOM_LEVEL &&
            allFetchedPlaces.length === 0 &&
            (selectedLocation || userCoordinates) &&
            newOsmData &&
            newOsmData.fetchedBbox &&
            newOsmData.places.length === 0 &&
            fetchedBoundsHistory.length > 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 z-10 pointer-events-none">
                <div className="bg-background/90 p-6 rounded-lg shadow-xl">
                  <SearchX className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-xl font-semibold mb-2">No Spots Found</h3>
                  <p className="text-muted-foreground">
                    We could not find any listed cafes, restaurants, or bars in
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
