// app/page.tsx
"use client";
import { useEffect } from "react";
import { ThemeToggleButton } from "@/components/theme-toggle-button";
import { Button } from "@/components/ui/button";
import { Loader2, LocateFixedIcon, RefreshCw } from "lucide-react";
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
import { MapOverlayMessage } from "@/components/map/MapOverlayMessage";
import { ZoomInIcon, SearchXIcon } from "lucide-react";
import { LanguagePicker } from "@/components/features/LanguagePicker";
import { useTranslation } from "@/context/i18nContext";

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
  const { t } = useTranslation();

  const {
    mapBoundsForQuery,
    mapZoom,
    mapRef,
    places,
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
    isFetched,
  } = queryResult;

  // Derived state for "No Spots Found" condition
  const showNoSpotsFoundMessage =
    !isLoadingOsmData && // Not currently loading new data
    mapZoom >= MIN_FETCH_ZOOM_LEVEL && // Zoomed in enough
    isFetched && // A query has completed (either success or error, but it ran)
    // newOsmData?.fetchedBbox !== null && // A fetch for some area (related to current view) happened
    places.length === 0; // And no places are currently in the viewport-specific list

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
        t("toasts.zoomInToSearchLevel", { level: MIN_FETCH_ZOOM_LEVEL })
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
              alt={t("altText")}
              width={36}
              height={38}
              className="h-8 inline-block mr-2"
              priority
            />
            <h1 className="text-xl font-semibold truncate hidden sm:inline">
              {t("appTitle")}
            </h1>
          </div>
          {/* Time Slider and Main Controls Area */}
          <div className="flex-grow flex flex-col sm:flex-row items-center justify-center sm:justify-end gap-2 w-full sm:w-auto">
            {/* Time Slider Component */}
            <div className="w-full sm:w-auto order-2 sm:order-1">
              <TimeSlider />
            </div>

            {/* Right-aligned controls */}
            <div className="flex items-center space-x-2 order-1 sm:order-2 self-end sm:self-center mb-32">
              <LanguagePicker />
              <BookmarkListSheet />
              <Button
                variant="outline"
                size="icon"
                onClick={requestUserLocation}
                title={t("tooltips.useMyLocation")}
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
          {/* Loading indicator for OSM Data */}
          {isLoadingOsmData &&
            mapBoundsForQuery &&
            mapZoom >= MIN_FETCH_ZOOM_LEVEL && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-20 space-y-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-lg text-muted-foreground">
                  {t("mapMessages.exploringNewAreas", {
                    location:
                      selectedLocation?.display_name ||
                      t("mapMessages.yourCurrentArea"),
                  })}
                </p>
              </div>
            )}
          {/* "Zoom In" Message */}
          {mapZoom < MIN_FETCH_ZOOM_LEVEL &&
            !isLoadingOsmData && ( // Also hide if actively loading
              <MapOverlayMessage
                variant="warning"
                position="top-center"
                icon={<ZoomInIcon className="h-6 w-6" />}
              >
                {t("mapMessages.zoomInPrompt.title")}
                <p className="text-xs opacity-90">
                  {t("mapMessages.zoomInPrompt.details", {
                    currentZoom: mapZoom.toFixed(0),
                    minLevel: MIN_FETCH_ZOOM_LEVEL,
                  })}
                </p>
              </MapOverlayMessage>
            )}

          {/* "No Spots Found" Message */}
          {showNoSpotsFoundMessage && (
            <MapOverlayMessage
              variant="default" // Or "info"
              position="center" // Or "top-center" if preferred
              icon={<SearchXIcon className="h-10 w-10" />}
              className="max-w-md text-center" // Example custom class for sizing
            >
              <h3 className="text-lg font-semibold mb-1">
                {t("noSpotsFound.title")}
              </h3>
              <p className="text-sm opacity-90 mb-2">
                {t("noSpotsFound.description")}
              </p>
              <p className="text-xs opacity-70">
                {t("noSpotsFound.osmNotice")}
              </p>
            </MapOverlayMessage>
          )}

          {hasMapMoved && mapZoom >= MIN_FETCH_ZOOM_LEVEL && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-1000">
              <Button
                onClick={handleSearchThisArea}
                variant="secondary"
                className="shadow-lg"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("buttons.searchThisArea")}
              </Button>
            </div>
          )}
          <MapComponentWithNoSSR />
        </main>
      </div>
      <footer className="p-2 border-t text-center text-xs text-muted-foreground bg-background">
        <PlaceDetailSheet />
        {t("footer.mapDataAttribution")} ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-primary"
        >
          OpenStreetMap
        </a>{" "}
        {t("footer.contributors")}. {t("footer.appSlogan")}
      </footer>
    </div>
  );
}
