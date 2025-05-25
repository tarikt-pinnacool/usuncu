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
import type LType from "leaflet"; // Import Leaflet type for mapRef.getBounds()

type SunShadeFilter = "all" | "sun" | "shade";

// Default map center (e.g., Sarajevo) if no location selected/found
const DEFAULT_MAP_CENTER: Coordinates = { lat: 43.8563, lng: 18.4131 };
const DEFAULT_MAP_ZOOM = 13;
const MIN_ZOOM_LEVEL_FOR_FETCH = 13; // Define a minimum zoom level for fetching

interface AppState {
  currentTime: Date;
  userCoordinates: Coordinates | null; // From browser geolocation
  isBookmarkSheetOpen: boolean;

  searchQuery: string;
  geocodingResults: GeocodingResult[]; // Suggestions from geocoding API
  selectedLocation: GeocodingResult | null; // The location picked by user from search or "my location"

  mapCenter: Coordinates; // Current center of the map
  mapZoom: number; // Current zoom level of the map
  mapBoundsForQuery: BoundingBox | null; // BBox string for Overpass API

  places: Place[];
  processedPlaces: Place[]; // Places with sun/shade status, relevantShadowPoint
  buildings: Building[];
  bookmarks: string[];
  sunShadeFilter: SunShadeFilter;
  mapRef: LType.Map | null; // Ensure this is correctly typed
  hasMapMoved: boolean;
  selectedPlaceDetail: Place | null;
  amenityNameQuery: string; // For filtering places by name

  // Actions
  setCurrentTime: (time: Date) => void;
  setUserCoordinates: (coords: Coordinates | null) => void;

  setSearchQuery: (query: string) => void;
  setGeocodingResults: (results: GeocodingResult[]) => void;
  setSelectedLocation: (location: GeocodingResult | null) => void; // Sets selected location and updates mapCenter/Bounds

  // Modified: added fromUserInteraction parameter
  setMapCenterAndZoom: (
    center: Coordinates,
    zoom: number,
    fromUserInteraction?: boolean
  ) => void;
  setMapBoundsForQuery: (bounds: BoundingBox | null) => void; // Keep for direct setting if needed (e.g. debugging)

  setPlaces: (places: Place[]) => void;
  setProcessedPlaces: (places: Place[]) => void;
  setBuildings: (buildings: Building[]) => void;
  addBookmark: (placeId: string) => void;
  removeBookmark: (placeId: string) => void;
  setSunShadeFilter: (filter: SunShadeFilter) => void;
  setMapRef: (map: LType.Map | null) => void; // Ensure L.Map type matches LType.Map

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
      userCoordinates: null,
      searchQuery: "",
      geocodingResults: [],
      selectedLocation: null,
      mapCenter: DEFAULT_MAP_CENTER,
      mapZoom: DEFAULT_MAP_ZOOM,
      mapBoundsForQuery: null,
      places: [],
      processedPlaces: [],
      buildings: [],
      bookmarks: [],
      sunShadeFilter: "all",
      mapRef: null, // Initialize mapRef as null
      isBookmarkSheetOpen: false,
      hasMapMoved: false,
      selectedPlaceDetail: null,
      amenityNameQuery: "",

      // Actions
      setCurrentTime: (time) => set({ currentTime: time }),
      setUserCoordinates: (coords) => {
        set({ userCoordinates: coords });
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
            set({
              mapCenter: DEFAULT_MAP_CENTER,
              mapZoom: DEFAULT_MAP_ZOOM,
              mapBoundsForQuery: null,
            });
          }
        }
      },

      // --- CRITICAL CHANGE HERE ---
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
            const currentMapRef = get().mapRef; // Get the actual Leaflet map instance
            let calculatedMapBoundsForQuery: BoundingBox | null = null;
            let shouldClearData = false;

            if (currentMapRef && fromUserInteraction) {
              // If this change is from user interaction (pan/zoom)
              if (newObservedZoom >= MIN_ZOOM_LEVEL_FOR_FETCH) {
                const bounds = currentMapRef.getBounds();
                calculatedMapBoundsForQuery = [
                  bounds.getSouth(),
                  bounds.getWest(),
                  bounds.getNorth(),
                  bounds.getEast(),
                ];
                // Always clear data when user changes map view at a fetchable zoom
                // to ensure a fresh fetch for the new area.
                shouldClearData = true;
              } else {
                // If zoomed out beyond threshold, clear bounds and data
                calculatedMapBoundsForQuery = null;
                shouldClearData = true;
                toast.info("Zoom in to see amenities in this area.");
              }
            } else if (!fromUserInteraction) {
              // If programmatic move (e.g., flyTo from processAndSetNewLocation or initial setup),
              // we DO NOT calculate bounds here. mapBoundsForQuery should have been set
              // by the calling `processAndSetNewLocation`, or remains null for default startup.
              // We also DO NOT clear data, as data clear would have happened in processAndSetNewLocation
              // or is not needed for initial map setup.
              calculatedMapBoundsForQuery = state.mapBoundsForQuery; // Keep current bounds
              shouldClearData = false;
            }

            const newState = {
              mapCenter: newObservedCenter,
              mapZoom: newObservedZoom,
              mapBoundsForQuery: calculatedMapBoundsForQuery, // This is the critical update
              hasMapMoved: fromUserInteraction ? true : state.hasMapMoved, // Flag user movement
            };

            // Conditionally clear data *after* setting the new state values
            if (shouldClearData) {
              return {
                ...newState,
                places: [],
                buildings: [],
                processedPlaces: [],
              };
            }
            return newState;
          } else {
            return {}; // No state change needed if observed view matches stored target view
          }
        });
      },
      // --- END CRITICAL CHANGE ---

      setMapBoundsForQuery: (bounds) => set({ mapBoundsForQuery: bounds }), // Keep this action for direct control if needed

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

      // --- REFINED: processAndSetNewLocation ---
      processAndSetNewLocation: (locationData, isUserGps = false) => {
        if (!locationData) {
          set({
            selectedLocation: null,
            searchQuery: "",
            mapCenter: DEFAULT_MAP_CENTER,
            mapZoom: DEFAULT_MAP_ZOOM,
            mapBoundsForQuery: null,
            selectedPlaceDetail: null,
            hasMapMoved: false,
            processedPlaces: [],
            places: [],
            buildings: [],
          });
          return;
        }

        const newCenter = { lat: locationData.lat, lng: locationData.lng };
        let newBounds: BoundingBox | null = null;
        let newZoom = DEFAULT_MAP_ZOOM;

        if (locationData.boundingbox) {
          newBounds = [
            parseFloat(locationData.boundingbox[0]), // S
            parseFloat(locationData.boundingbox[2]), // W
            parseFloat(locationData.boundingbox[1]), // N
            parseFloat(locationData.boundingbox[3]), // E
          ];
          newZoom = 14; // Default zoom for a searched location
        } else if (isUserGps) {
          const radiusKm = 2; // Fetch data within 2km radius for GPS
          const centerPoint = turf.point([newCenter.lng, newCenter.lat]);
          const buffered = turf.buffer(centerPoint, radiusKm, {
            units: "kilometers",
          });

          if (buffered && buffered.geometry) {
            const bboxArray = turf.bbox(buffered);
            newBounds = [
              bboxArray[1],
              bboxArray[0],
              bboxArray[3],
              bboxArray[2],
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

        // When a new explicit location is set, we:
        // 1. Update mapCenter, mapZoom, and mapBoundsForQuery to match the new location.
        // 2. Clear existing places/buildings immediately because new data is expected.
        // 3. Reset hasMapMoved as a new "query area" has been set.
        set({
          mapCenter: newCenter,
          mapZoom: newZoom,
          mapBoundsForQuery: newBounds, // Set the specific bounds for the new explicit location
          selectedLocation: newSelectedLocationState,
          searchQuery: newSearchQueryState,
          hasMapMoved: false, // Reset this flag
          places: [], // Clear old data for a fresh fetch
          buildings: [],
          processedPlaces: [],
        });
      },
      // --- END REFINED processAndSetNewLocation ---

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
