// store/appStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  Place,
  Building,
  Coordinates,
  GeocodingResult,
  BoundingBox,
} from "@/lib/types";
import { toast } from "sonner";
import * as turf from "@turf/turf";
import type LType from "leaflet";

type SunShadeFilter = "all" | "sun" | "shade";

const DEFAULT_MAP_CENTER: Coordinates = { lat: 43.8563, lng: 18.4131 };
const DEFAULT_MAP_ZOOM = 13;
const MIN_ZOOM_LEVEL_FOR_FETCH = 13; // Set a realistic minimum zoom for fetching detailed data

interface AppState {
  currentTime: Date;
  isTimeManuallyControlled: boolean;
  userCoordinates: Coordinates | null;
  isBookmarkSheetOpen: boolean;

  searchQuery: string;
  geocodingResults: GeocodingResult[];
  selectedLocation: GeocodingResult | null;

  mapCenter: Coordinates;
  mapZoom: number;
  // mapBoundsForQuery will now strictly represent the *current map viewport bounds*.
  // It is NOT the query key for fetching, but rather the basis for calculating *what* to fetch.
  mapBoundsForQuery: BoundingBox | null;

  // NEW: Global pool of all fetched data
  allFetchedPlaces: Place[];
  allFetchedBuildings: Building[];
  // NEW: History of bounding boxes for which data has been successfully fetched
  fetchedBoundsHistory: BoundingBox[];

  // These remain but will be populated by a derived state effect in `app/page.tsx`
  // They represent the data *currently visible* in the map viewport.
  places: Place[];
  processedPlaces: Place[]; // This needs to be populated from `places` (the filtered ones)
  buildings: Building[];

  bookmarks: string[];
  sunShadeFilter: SunShadeFilter;
  mapRef: LType.Map | null;
  hasMapMoved: boolean;
  selectedPlaceDetail: Place | null;
  amenityNameQuery: string;

  // Actions
  setCurrentTime: (time: Date) => void;
  setManualTime: (time: Date) => void; // For slider interaction
  switchToLiveTime: () => void; // To revert to live time
  setIsTimeManuallyControlled: (isManual: boolean) => void; // Direct setter if needed

  setUserCoordinates: (coords: Coordinates | null) => void;

  setSearchQuery: (query: string) => void;
  setGeocodingResults: (results: GeocodingResult[]) => void;
  setSelectedLocation: (location: GeocodingResult | null) => void;

  setMapCenterAndZoom: (
    center: Coordinates,
    zoom: number,
    fromUserInteraction?: boolean
  ) => void;
  // setMapBoundsForQuery is still available for explicit setting (e.g., "Search This Area" button)
  setMapBoundsForQuery: (bounds: BoundingBox | null) => void;

  // NEW: Actions to manage the global data pool
  addFetchedOsmData: (
    newPlaces: Place[],
    newBuildings: Building[],
    fetchedBbox: BoundingBox
  ) => void;
  clearAllOsmData: () => void; // Clears global data pool and history

  // These are now setters for the *filtered* data relevant to the current viewport
  setPlaces: (places: Place[]) => void;
  setProcessedPlaces: (places: Place[]) => void;
  setBuildings: (buildings: Building[]) => void;

  addBookmark: (placeId: string) => void;
  removeBookmark: (placeId: string) => void;
  setSunShadeFilter: (filter: SunShadeFilter) => void;
  setMapRef: (map: LType.Map | null) => void;

  processAndSetNewLocation: (
    locationData: {
      lat: number;
      lng: number;
      displayName: string;
      boundingbox?: [string, string, string, string];
    } | null,
    isUserGps?: boolean
  ) => void;
  setIsBookmarkSheetOpen: (isOpen: boolean) => void;
  setHasMapMoved: (moved: boolean) => void;
  setSelectedPlaceDetail: (place: Place | null) => void;
  setAmenityNameQuery: (query: string) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Initial State
      currentTime: new Date(),
      isTimeManuallyControlled: false,
      userCoordinates: null,
      searchQuery: "",
      geocodingResults: [],
      selectedLocation: null,
      mapCenter: DEFAULT_MAP_CENTER,
      mapZoom: DEFAULT_MAP_ZOOM,
      mapBoundsForQuery: null,

      // NEW: Initialize global data pools
      allFetchedPlaces: [],
      allFetchedBuildings: [],
      fetchedBoundsHistory: [],

      places: [], // Will be updated by derived state logic in app/page.tsx
      processedPlaces: [], // Will be updated by MapComponent.tsx based on 'places'
      buildings: [], // Will be updated by derived state logic in app/page.tsx

      bookmarks: [],
      sunShadeFilter: "all",
      mapRef: null,
      isBookmarkSheetOpen: false,
      hasMapMoved: false,
      selectedPlaceDetail: null,
      amenityNameQuery: "",

      // Actions
      setCurrentTime: (time) => {
        // This action is primarily for the useCurrentTime hook (live updates)
        // It should only update if time is NOT manually controlled.
        if (!get().isTimeManuallyControlled) {
          set({ currentTime: time });
        }
      },
      setManualTime: (time) => {
        set({ currentTime: time, isTimeManuallyControlled: true });
      },
      switchToLiveTime: () => {
        set({ currentTime: new Date(), isTimeManuallyControlled: false });
      },
      setIsTimeManuallyControlled: (isManual) => {
        // Added for direct control if needed
        set({ isTimeManuallyControlled: isManual });
        if (!isManual) {
          // If switching back to auto, refresh time
          set({ currentTime: new Date() });
        }
      },

      setUserCoordinates: (coords) => {
        set({ userCoordinates: coords });
        // If no explicit location selected and GPS is available, use GPS for initial view
        if (coords && !get().selectedLocation && !get().mapBoundsForQuery) {
          get().processAndSetNewLocation(
            {
              lat: coords.lat,
              lng: coords.lng,
              displayName: "My Current Location",
            },
            true
          );
        }
      },
      setSearchQuery: (query) => set({ searchQuery: query }),
      setGeocodingResults: (results) => set({ geocodingResults: results }),
      setSelectedLocation: (location) => {
        set((state) => ({
          selectedLocation: location,
          searchQuery: location ? location.display_name : state.searchQuery,
          geocodingResults: [],
        }));

        if (location) {
          get().processAndSetNewLocation({
            lat: parseFloat(location.lat),
            lng: parseFloat(location.lon),
            displayName: location.display_name,
            boundingbox: location.boundingbox,
          });
        } else {
          // If location is cleared, revert to user GPS if available, or default
          const userCoords = get().userCoordinates;
          if (userCoords) {
            get().processAndSetNewLocation(
              {
                lat: userCoords.lat,
                lng: userCoords.lng,
                displayName: "My Current Location",
              },
              true
            );
          } else {
            // Revert to default map view and clear all data
            get().clearAllOsmData();
            set({
              mapCenter: DEFAULT_MAP_CENTER,
              mapZoom: DEFAULT_MAP_ZOOM,
              mapBoundsForQuery: null,
            });
          }
        }
      },

      setMapCenterAndZoom: (
        newObservedCenter,
        newObservedZoom,
        fromUserInteraction = true
      ) => {
        set((state) => {
          const viewActuallyChanged =
            state.mapCenter.lat.toFixed(5) !==
              newObservedCenter.lat.toFixed(5) ||
            state.mapCenter.lng.toFixed(5) !==
              newObservedCenter.lng.toFixed(5) ||
            state.mapZoom !== newObservedZoom;

          if (viewActuallyChanged) {
            const currentMapRef = get().mapRef;
            let calculatedMapBoundsForQuery: BoundingBox | null = null;
            let shouldClearAllData = false; // Flag to clear global data if zoom is too far out

            if (currentMapRef) {
              // Ensure mapRef is available
              if (newObservedZoom >= MIN_ZOOM_LEVEL_FOR_FETCH) {
                const bounds = currentMapRef.getBounds();
                calculatedMapBoundsForQuery = [
                  bounds.getSouth(),
                  bounds.getWest(),
                  bounds.getNorth(),
                  bounds.getEast(),
                ];
              } else {
                calculatedMapBoundsForQuery = null; // Too zoomed out to query
                shouldClearAllData = true; // Signal to clear all previously fetched data
                toast.info(
                  `Zoom in to at least level ${MIN_ZOOM_LEVEL_FOR_FETCH} to load places.`
                );
              }
            }

            const newState = {
              mapCenter: newObservedCenter,
              mapZoom: newObservedZoom,
              mapBoundsForQuery: calculatedMapBoundsForQuery, // This reflects *current viewport* for page.tsx to use
              hasMapMoved: fromUserInteraction ? true : state.hasMapMoved, // Indicate user interaction
            };

            if (shouldClearAllData) {
              // If we zoom out too far, clear all accumulated data and history.
              // This forces a fresh fetch when user zooms back in.
              return {
                ...newState,
                allFetchedPlaces: [],
                allFetchedBuildings: [],
                fetchedBoundsHistory: [],
                // Also clear derived states (places, buildings, processedPlaces)
                places: [],
                buildings: [],
                processedPlaces: [],
              };
            }
            return newState;
          } else {
            return {}; // No state change if observed view matches stored target view
          }
        });
      },
      setMapBoundsForQuery: (bounds) => {
        // This is called by "Search This Area" button or `processAndSetNewLocation`.
        // When explicitly setting bounds (like a new search), we should reset all data and history.
        get().clearAllOsmData(); // Clear previous data and history
        set({ mapBoundsForQuery: bounds, hasMapMoved: false }); // Set new bounds and reset 'moved' flag
      },

      // NEW: Action to merge new fetched data into the global pool
      addFetchedOsmData: (newPlaces, newBuildings, fetchedBbox) => {
        set((state) => {
          // Deduplicate new places before merging
          const existingPlaceIds = new Set(
            state.allFetchedPlaces.map((p) => p.id)
          );
          const uniqueNewPlaces = newPlaces.filter(
            (p) => !existingPlaceIds.has(p.id)
          );
          const updatedAllFetchedPlaces = [
            ...state.allFetchedPlaces,
            ...uniqueNewPlaces,
          ];

          // Deduplicate new buildings before merging
          const existingBuildingIds = new Set(
            state.allFetchedBuildings.map((b) => b.id)
          );
          const uniqueNewBuildings = newBuildings.filter(
            (b) => !existingBuildingIds.has(b.id)
          );
          const updatedAllFetchedBuildings = [
            ...state.allFetchedBuildings,
            ...uniqueNewBuildings,
          ];

          // Add the newly fetched bounding box to the history
          // Simple addition for now; getUnfetchedAreas handles complex overlaps
          const updatedFetchedBoundsHistory = [
            ...state.fetchedBoundsHistory,
            fetchedBbox,
          ];

          return {
            allFetchedPlaces: updatedAllFetchedPlaces,
            allFetchedBuildings: updatedAllFetchedBuildings,
            fetchedBoundsHistory: updatedFetchedBoundsHistory,
          };
        });
      },
      // NEW: Action to clear all global data and history
      clearAllOsmData: () => {
        set({
          allFetchedPlaces: [],
          allFetchedBuildings: [],
          fetchedBoundsHistory: [],
          places: [], // Also clear derived states
          buildings: [],
          processedPlaces: [],
        });
      },

      // These actions remain but are now populated by `app/page.tsx` derived state logic
      setPlaces: (places) => set({ places }),
      setProcessedPlaces: (newProcessedPlaces) =>
        set({ processedPlaces: newProcessedPlaces }),
      setBuildings: (buildings) => set({ buildings }),

      addBookmark: (placeId) =>
        set((state) => ({
          bookmarks: Array.from(new Set([...state.bookmarks, placeId])),
        })),
      removeBookmark: (placeId) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter((id) => id !== placeId),
        })),
      setSunShadeFilter: (filter) => set({ sunShadeFilter: filter }),
      setMapRef: (map) => set({ mapRef: map }),
      setHasMapMoved: (moved) => set({ hasMapMoved: moved }),
      setSelectedPlaceDetail: (place) => {
        set({ selectedPlaceDetail: place });
      },
      processAndSetNewLocation: (locationData, isUserGps = false) => {
        // When a new explicit location is set (via search or GPS), we clear all old data
        // This ensures a fresh start for fetching in the new location.
        get().clearAllOsmData();

        if (!locationData) {
          set({
            selectedLocation: null,
            searchQuery: "",
            mapCenter: DEFAULT_MAP_CENTER,
            mapZoom: DEFAULT_MAP_ZOOM,
            mapBoundsForQuery: null,
            selectedPlaceDetail: null,
            hasMapMoved: false,
          });
          return;
        }

        const newCenter = { lat: locationData.lat, lng: locationData.lng };
        let newBounds: BoundingBox | null = null;
        let newZoom = DEFAULT_MAP_ZOOM;

        if (locationData.boundingbox) {
          // Nominatim boundingbox: [minlat, maxlat, minlon, maxlon]
          // Our BoundingBox: [S, W, N, E]
          newBounds = [
            parseFloat(locationData.boundingbox[0]), // minLat (S)
            parseFloat(locationData.boundingbox[2]), // minLng (W)
            parseFloat(locationData.boundingbox[1]), // maxLat (N)
            parseFloat(locationData.boundingbox[3]), // maxLng (E)
          ];
          newZoom = 14; // Default zoom for a searched location
        } else if (isUserGps) {
          const radiusKm = 2; // Fetch data within 2km radius for GPS
          const centerPoint = turf.point([newCenter.lng, newCenter.lat]);
          const buffered = turf.buffer(centerPoint, radiusKm, {
            units: "kilometers",
          });

          if (buffered && buffered.geometry) {
            const bboxArray = turf.bbox(buffered); // turf.bbox returns [minX, minY, maxX, maxY] (w,s,e,n)
            newBounds = [
              bboxArray[1], // South
              bboxArray[0], // West
              bboxArray[3], // North
              bboxArray[2], // East
            ];
            newZoom = 15; // Slightly closer zoom for user's immediate vicinity
          } else {
            console.warn(
              "Could not create buffer for user GPS location, using default map view."
            );
            newBounds = null;
            newZoom = DEFAULT_MAP_ZOOM;
          }
        }

        let newSelectedLocationState: GeocodingResult | null = null;
        let newSearchQueryState = get().searchQuery;

        if (isUserGps) {
          newSelectedLocationState = null;
          newSearchQueryState = "";
        } else if (locationData.boundingbox && locationData.displayName) {
          newSelectedLocationState = {
            place_id: 0,
            osm_type: "",
            osm_id: 0,
            licence: "",
            class: "",
            type: "",
            importance: 0,
            boundingbox: locationData.boundingbox,
            lat: String(locationData.lat),
            lon: String(locationData.lng),
            display_name: locationData.displayName,
          };
          newSearchQueryState = locationData.displayName;
        } else {
          newSelectedLocationState = get().selectedLocation;
        }

        // Set the map view and the initial query bounds
        set({
          mapCenter: newCenter,
          mapZoom: newZoom,
          mapBoundsForQuery: newBounds, // This sets the initial query area for the new location
          selectedLocation: newSelectedLocationState,
          searchQuery: newSearchQueryState,
          hasMapMoved: false,
        });
      },
      setIsBookmarkSheetOpen: (isOpen) => {
        set({ isBookmarkSheetOpen: isOpen });
        if (isOpen && get().selectedPlaceDetail) {
          set({ selectedPlaceDetail: null });
        }
      },
      setAmenityNameQuery: (query) => set({ amenityNameQuery: query }),
    }),

    {
      name: "sunseeker-storage",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ bookmarks: state.bookmarks }),
    }
  )
);
