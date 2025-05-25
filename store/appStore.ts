// store/appStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware"; // For persisting some state
import {
  Place,
  Building,
  Coordinates,
  GeocodingResult,
  BoundingBox,
} from "@/lib/types";
import { toast } from "sonner";
import * as turf from "@turf/turf";

type SunShadeFilter = "all" | "sun" | "shade";

// Default map center (e.g., Sarajevo) if no location selected/found
const DEFAULT_MAP_CENTER: Coordinates = { lat: 43.8563, lng: 18.4131 };
const DEFAULT_MAP_ZOOM = 13; // Add a default zoom

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
  mapRef: L.Map | null;
  hasMapMoved: boolean;
  selectedPlaceDetail: Place | null;
  amenityNameQuery: string; // For filtering places by name

  // Actions
  setCurrentTime: (time: Date) => void;
  setUserCoordinates: (coords: Coordinates | null) => void;

  setSearchQuery: (query: string) => void;
  setGeocodingResults: (results: GeocodingResult[]) => void;
  setSelectedLocation: (location: GeocodingResult | null) => void; // Sets selected location and updates mapCenter/Bounds

  setMapCenterAndZoom: (center: Coordinates, zoom: number) => void; // For manual map interaction
  setMapBoundsForQuery: (bounds: BoundingBox | null) => void;

  setPlaces: (places: Place[]) => void;
  setProcessedPlaces: (places: Place[]) => void;
  setBuildings: (buildings: Building[]) => void;
  addBookmark: (placeId: string) => void;
  removeBookmark: (placeId: string) => void;
  setSunShadeFilter: (filter: SunShadeFilter) => void;
  setMapRef: (map: L.Map | null) => void;

  // Action to process selection (either user's GPS or a searched location)
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
    // Use persist middleware
    (set, get) => ({
      // Initial State
      currentTime: new Date(),
      userCoordinates: null,
      searchQuery: "",
      geocodingResults: [],
      selectedLocation: null,
      mapCenter: DEFAULT_MAP_CENTER,
      mapZoom: DEFAULT_MAP_ZOOM,
      mapBoundsForQuery: null, // Will be derived from selectedLocation or userCoordinates + radius
      places: [],
      processedPlaces: [],
      buildings: [],
      bookmarks: [], // Bookmarks will be persisted
      sunShadeFilter: "all",
      mapRef: null,
      isBookmarkSheetOpen: false,
      hasMapMoved: false,
      selectedPlaceDetail: null, // Default to no place selected
      amenityNameQuery: "", // Default to no name filter

      // Actions
      setCurrentTime: (time) => set({ currentTime: time }),
      setUserCoordinates: (coords) => {
        set({ userCoordinates: coords });
        // This ensures that if the app loads and gets GPS before any search, it uses GPS.
        if (coords && !get().selectedLocation && !get().mapBoundsForQuery) {
          // If no active search/bounds and GPS comes in
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
          // Use function form to access previous state for searchQuery
          selectedLocation: location,
          searchQuery: location ? location.display_name : state.searchQuery, // Keep current query if location is null
          geocodingResults: [],
        }));

        if (location) {
          get().processAndSetNewLocation({
            lat: parseFloat(location.lat), // lat is string in GeocodingResult
            lng: parseFloat(location.lon), // lon is string in GeocodingResult
            displayName: location.display_name,
            boundingbox: location.boundingbox,
          });
        } else {
          // If location is cleared, maybe revert to user GPS if available, or default
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
      setMapCenterAndZoom: (newObservedCenter, newObservedZoom) => {
        set((state) => {
          const viewActuallyChanged = // This checks if the new view is different from what the store *thinks* the view should be
            state.mapCenter.lat.toFixed(5) !==
              newObservedCenter.lat.toFixed(5) ||
            state.mapCenter.lng.toFixed(5) !==
              newObservedCenter.lng.toFixed(5) ||
            state.mapZoom !== newObservedZoom;

          if (viewActuallyChanged) {
            // Now, determine if this interaction means we've moved away from a data-loaded area.
            // The "Search This Area" button should appear if mapBoundsForQuery *was* set (meaning data was loaded for an area)
            // and the current view (newObservedCenter/Zoom) is now different.
            const shouldSetHasMapMoved = !!state.mapBoundsForQuery;

            return {
              mapCenter: newObservedCenter, // Update store to reflect the map's actual current view
              mapZoom: newObservedZoom,
              hasMapMoved: shouldSetHasMapMoved, // This is the critical update
            };
          } else {
            return {}; // No state change needed if observed view matches stored target view
          }
        });
      },
      setMapBoundsForQuery: (bounds) => set({ mapBoundsForQuery: bounds }),

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
        // Optionally, if the detail sheet opens, ensure the bookmark sheet closes, or vice-versa
        // if (place && get().isBookmarkSheetOpen) {
        //   set({ isBookmarkSheetOpen: false });
        // }
      },
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
          });
          return;
        }

        // Clear old places/buildings
        if (get().places.length > 0 || get().buildings.length > 0) {
          set({ places: [], buildings: [], processedPlaces: [] });
        }

        const newCenter = { lat: locationData.lat, lng: locationData.lng };
        let newBounds: BoundingBox | null = null;
        let newZoom = DEFAULT_MAP_ZOOM; // Default zoom

        if (locationData.boundingbox) {
          // Nominatim boundingbox: [minlat, maxlat, minlon, maxlon]
          // Overpass expects: S, W, N, E (minLat, minLng, maxLat, maxLng)
          newBounds = [
            parseFloat(locationData.boundingbox[0]), // minLat (S)
            parseFloat(locationData.boundingbox[2]), // minLng (W)
            parseFloat(locationData.boundingbox[1]), // maxLat (N)
            parseFloat(locationData.boundingbox[3]), // maxLng (E)
          ];
          // Try to estimate a reasonable zoom level from bbox. This is tricky.
          // A simpler approach is to set a fixed zoom for searched locations.
          newZoom = 14; // Or derive from importance/type if available
        } else if (isUserGps) {
          const radiusKm = 2;
          const centerPoint = turf.point([newCenter.lng, newCenter.lat]);
          const buffered = turf.buffer(centerPoint, radiusKm, {
            units: "kilometers",
          });

          if (buffered && buffered.geometry) {
            // CHECK if buffered and its geometry exist
            const bboxArray = turf.bbox(buffered); // Now buffered is guaranteed to be a Feature
            newBounds = [
              bboxArray[1],
              bboxArray[0],
              bboxArray[3],
              bboxArray[2],
            ];
            newZoom = 15;
          } else {
            console.warn(
              "Could not create buffer for user GPS location, using default map view."
            );
            // Fallback if buffer creation fails - perhaps keep previous bounds or set to null
            // For now, newBounds will remain null, and useQuery might not run if it's the only source of bounds
            newBounds = null; // Explicitly set to null
            newZoom = DEFAULT_MAP_ZOOM; // Revert to a wider zoom
          }
        }

        let newSelectedLocationState: GeocodingResult | null = null;
        let newSearchQueryState = get().searchQuery;

        if (isUserGps) {
          newSelectedLocationState = null; // Clear searched location if we're using GPS
          newSearchQueryState = ""; // Clear search query text
        } else if (locationData.boundingbox && locationData.displayName) {
          // This was a searched location
          newSelectedLocationState = {
            place_id: 0,
            osm_type: "",
            osm_id: 0,
            licence: "",
            class: "",
            type: "",
            importance: 0, // placeholders
            boundingbox: locationData.boundingbox,
            lat: String(locationData.lat),
            lon: String(locationData.lng), // Make sure this is 'lon' from original data if that was the key
            display_name: locationData.displayName,
          };
          newSearchQueryState = locationData.displayName;
        } else {
          // Fallback or keep existing selected location if it wasn't explicitly user GPS or a full search result
          newSelectedLocationState = get().selectedLocation;
        }

        // Update store
        set({
          mapCenter: newCenter,
          mapZoom: newZoom,
          mapBoundsForQuery: newBounds,
          selectedLocation:
            !isUserGps && locationData.boundingbox && locationData.displayName // Check displayName too
              ? {
                  // Construct a proper GeocodingResult if this was from search
                  place_id: 0, // placeholder or derive if available
                  osm_type: "", // placeholder
                  osm_id: 0, // placeholder
                  licence: "", // placeholder
                  boundingbox: locationData.boundingbox,
                  lat: String(locationData.lat), // Convert number to string
                  lon: String(locationData.lng), // Convert number to string (lon not lng for GeocodingResult)
                  display_name: locationData.displayName,
                  class: "", // placeholder
                  type: "", // placeholder
                  importance: 0, // placeholder
                }
              : isUserGps
              ? null
              : get().selectedLocation, // If user GPS, selectedLocation becomes null, else keep existing
        });

        // Clear old places/buildings when location changes significantly
        if (get().places.length > 0 || get().buildings.length > 0) {
          set({ places: [], buildings: [] });
        }
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
      name: "sunseeker-storage", // name of the item in the storage (must be unique)
      storage: createJSONStorage(() => localStorage), // (optional) by default, 'localStorage' is used
      partialize: (state) => ({ bookmarks: state.bookmarks }), // Only persist bookmarks
    }
  )
);
