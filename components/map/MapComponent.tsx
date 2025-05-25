// components/map/MapComponent.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type LType from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAppStore } from "@/store/appStore";
import { Place } from "@/lib/types";
import { useSunPosition } from "@/hooks/useSunPosition";
import {
  calculateShadowPolygon,
  getRelevantShadowPointForPlace,
  isLocationInSun,
} from "@/lib/shadow";
import { Feature as GeoJsonFeature, Polygon as GeoJsonPolygon } from "geojson";
import { useDebouncedCallback } from "use-debounce";
import { toast } from "sonner";

let L: typeof LType | undefined = undefined;

interface IconOptions {
  type: "sun" | "shade" | "unknown";
  isBookmarked?: boolean;
  isSelected?: boolean;
}

// For custom event handler properties on popup buttons
interface UsuncuButton extends HTMLButtonElement {
  _usuncuBookmarkHandler?: EventListener;
  _usuncuDetailHandler?: EventListener;
}

const createLeafletIcon = (options: IconOptions): LType.DivIcon | undefined => {
  if (!L) return undefined;

  let baseColorClass = "text-slate-600 dark:text-slate-400"; // For unknown or default shade
  let iconFillColor = "bg-white dark:bg-slate-700"; // Background of the circle
  let iconSvgPath = `<circle cx="12" cy="12" r="7" fill="currentColor" opacity="0.5"/> <circle cx="12" cy="12" r="3" fill="white"/>`; // Default dot

  if (options.type === "sun") {
    baseColorClass = "text-orange-500 dark:text-orange-400";
    iconFillColor = "bg-yellow-50 dark:bg-orange-900/50";
    iconSvgPath = `<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2"/><path d="M12 19.5v2"/><path d="m5.23 5.23 1.41 1.41"/><path d="m17.36 17.36 1.41 1.41"/><path d="M2.5 12h2"/><path d="M19.5 12h2"/><path d="m6.64 17.36-1.41 1.41"/><path d="m18.77 5.23-1.41 1.41"/>`;
  } else if (options.type === "shade") {
    baseColorClass = "text-sky-600 dark:text-sky-400";
    iconFillColor = "bg-sky-50 dark:bg-sky-900/50";
    iconSvgPath = `<path d="M12 3a6.36 6.36 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`;
  }

  let iconSize = 28;
  let wrapperClasses = `custom-place-icon rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ease-in-out`;
  let borderClasses = "border-2 border-transparent"; // Default no distinct border

  if (options.isSelected) {
    iconSize = 36;
    borderClasses = `border-4 border-primary dark:border-primary shadow-xl ring-2 ring-offset-1 ring-offset-background dark:ring-offset-background ring-primary/50`; // Prominent border/ring
    // pulseAnimation = `animate-pulse`; // Add to wrapperClasses if desired
  } else if (options.isBookmarked) {
    borderClasses = `border-2 border-yellow-400 dark:border-yellow-500`;
  }

  wrapperClasses += ` ${iconFillColor} ${borderClasses}`;

  const iconHtml = `
    <div class="${wrapperClasses}" style="width:${iconSize}px; height:${iconSize}px;">
      <svg xmlns="http://www.w3.org/2000/svg" 
           width="${options.isSelected ? "20" : "18"}" height="${
    options.isSelected ? "20" : "18"
  }" 
           viewBox="0 0 24 24" 
           fill="none" 
           stroke="currentColor" <!-- Will be set by baseColorClass -->
           class="${baseColorClass}"
           stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        ${iconSvgPath}
      </svg>
      ${
        options.isBookmarked && options.isSelected
          ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="gold" stroke="darkorange" stroke-width="1" class="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      `
          : options.isBookmarked
          ? `
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="gold" stroke="darkorange" stroke-width="1.5" class="absolute top-0 right-0 -mt-0.5 -mr-0.5">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      `
          : ""
      }
    </div>
  `;

  return L.divIcon({
    className: "", // Keep this empty; all styles are on the inner div
    html: iconHtml,
    iconSize: [iconSize, iconSize],
    iconAnchor: [iconSize / 2, iconSize], // Bottom-center
    popupAnchor: [0, -iconSize + 4], // Adjust popup anchor if icon size changes
    tooltipAnchor: [0, -iconSize / 2 - 2], // Adjust tooltip anchor
  });
};

const MapComponent = () => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LType.Map | null>(null);

  const {
    mapCenter,
    mapZoom,
    setMapRef,
    setMapCenterAndZoom,
    places: allPlacesFromStore,
    processedPlaces,
    setProcessedPlaces,
    buildings,
    currentTime,
    sunShadeFilter,
    amenityNameQuery,
    bookmarks,
    addBookmark,
    removeBookmark,
    isBookmarkSheetOpen,
    selectedPlaceDetail,
    setSelectedPlaceDetail,
    setIsBookmarkSheetOpen,
    // setMapBoundsForQuery, // Not directly used for map events here
  } = useAppStore();

  const sunPosition = useSunPosition(mapCenter.lat, mapCenter.lng);
  const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);
  const [markerInstances, setMarkerInstances] = useState<
    Map<string, LType.Marker>
  >(new Map());
  const [shadowLayers, setShadowLayers] = useState<LType.GeoJSON[]>([]); // For managing shadow L.GeoJSON objects

  useEffect(() => {
    if (typeof window === "undefined") return;

    import("leaflet").then((leafletModule) => {
      L = leafletModule.default;
      if (!L) return;

      // Standard Leaflet icon fix
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })
        ._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
      setIsLeafletLoaded(true);
    });

    // Cleanup for L potentially being re-assigned if component re-mounts (though unlikely here)
    // No specific cleanup for L itself unless it had global side effects we managed.
  }, []); // Run once to load Leaflet module

  // Memoized callback for map view changes
  const processMapViewChange = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const currentMap = mapInstanceRef.current;
    const newCenter = currentMap.getCenter();
    const newZoom = currentMap.getZoom();
    setMapCenterAndZoom(
      { lat: newCenter.lat, lng: newCenter.lng },
      newZoom,
      true
    );
  }, [setMapCenterAndZoom]);

  // Create a debounced version of the handler AT THE TOP LEVEL OF THE COMPONENT
  const debouncedProcessMapViewChange = useDebouncedCallback(
    processMapViewChange,
    300
  ); // 300ms debounce

  // 2. Effect for Map Instance Initialization & Core Event Listeners
  useEffect(() => {
    if (
      isLeafletLoaded &&
      L &&
      mapContainerRef.current &&
      !mapInstanceRef.current
    ) {
      const map = L.map(mapContainerRef.current).setView(
        [mapCenter.lat, mapCenter.lng],
        mapZoom
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OSM",
      }).addTo(map);
      mapInstanceRef.current = map;
      setMapRef(map); // Store the Leaflet map instance in Zustand

      // --- CRITICAL ADDITION ---
      // Initial bounds calculation for data fetching for the initial map view.
      // This is a programmatic setup (initial map load), so `fromUserInteraction` is `false`.
      // This ensures mapBoundsForQuery is correctly set for the initial view,
      // without triggering a data clear if data was already loaded by `processAndSetNewLocation`.
      const initialMapCenter = map.getCenter();
      const initialMapZoom = map.getZoom();
      setMapCenterAndZoom(
        { lat: initialMapCenter.lat, lng: initialMapCenter.lng },
        initialMapZoom,
        false
      );
      // --- END CRITICAL ADDITION ---

      map.on("moveend", debouncedProcessMapViewChange);
      map.on("zoomend", debouncedProcessMapViewChange);

      return () => {
        if (map) {
          map.off("moveend", debouncedProcessMapViewChange);
          map.off("zoomend", debouncedProcessMapViewChange);
          debouncedProcessMapViewChange.cancel();
          map.remove();
        }
        mapInstanceRef.current = null;
        setMapRef(null);
      };
    }
    // Add setMapCenterAndZoom as a dependency as it's now called here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLeafletLoaded,
    debouncedProcessMapViewChange,
    setMapRef,
    setMapCenterAndZoom,
  ]);

  // 3. Effect for Updating Map View (flyTo)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map && isLeafletLoaded) {
      const currentMapCenter = map.getCenter();
      const currentMapZoom = map.getZoom();
      if (
        currentMapCenter.lat.toFixed(5) !== mapCenter.lat.toFixed(5) ||
        currentMapCenter.lng.toFixed(5) !== mapCenter.lng.toFixed(5) ||
        currentMapZoom !== mapZoom
      ) {
        map.flyTo([mapCenter.lat, mapCenter.lng], mapZoom);
      }
    }
  }, [mapCenter, mapZoom, isLeafletLoaded]);

  // 4. Effect for Invalidating Map Size
  useEffect(() => {
    const map = mapInstanceRef.current;
    // Assuming PlaceDetailSheet also uses a similar store variable like `isPlaceDetailSheetOpen`
    if (map && isLeafletLoaded) {
      const timer = setTimeout(() => {
        map.invalidateSize({ animate: true });
      }, 350); // Match transition duration of sheet/layout changes
      return () => clearTimeout(timer);
    }
  }, [isBookmarkSheetOpen, selectedPlaceDetail, isLeafletLoaded]); // Trigger on either sheet's visibility

  // 5. Effect for Popup Event Listeners
  useEffect(() => {
    if (!isLeafletLoaded || !mapInstanceRef.current) {
      // ("Popup listener effect: Map or Leaflet not ready.");
      return;
    }

    const map = mapInstanceRef.current;

    const onPopupBookmarkClick = (e: Event) => {
      const currentTarget = e.currentTarget as HTMLElement;
      if (currentTarget.classList.contains("popup-bookmark-button")) {
        const placeId = currentTarget.dataset.placeId;
        const placeName = currentTarget.dataset.placeName;
        if (placeId) {
          const isBookmarked = bookmarks.includes(placeId); // `bookmarks` from effect closure
          if (isBookmarked) {
            removeBookmark(placeId); // `removeBookmark` from effect closure
            toast.success(`"${placeName || "Place"}" removed from bookmarks.`);
          } else {
            addBookmark(placeId); // `addBookmark` from effect closure
            toast.success(`"${placeName || "Place"}" added to bookmarks!`);
          }
          map.closePopup();
        }
      }
    };

    const onPopupViewDetailsClick = (e: Event) => {
      const currentTarget = e.currentTarget as HTMLElement;
      if (currentTarget.classList.contains("view-details-button-popup")) {
        const placeId = currentTarget.dataset.placeId;
        if (placeId) {
          // *** CRITICAL: Find the place from 'processedPlaces' ***
          const placeToDetail = processedPlaces.find((p) => p.id === placeId);
          if (placeToDetail) {
            setIsBookmarkSheetOpen(false);
            setSelectedPlaceDetail(placeToDetail); // This place object has the latest isInSun
            map.closePopup();
          } else {
            // This might happen if processedPlaces isn't up-to-date yet when popup is clicked
            console.warn(
              "MapComponent: View Details Clicked: Place not found in processedPlaces for ID:",
              placeId
            );
            // Fallback to allPlacesFromStore, but its isInSun might be stale/null
            const fallbackPlace = allPlacesFromStore.find(
              (p) => p.id === placeId
            );
            if (fallbackPlace) {
              console.warn(
                "MapComponent: Fallback to place from allPlacesFromStore (isInSun might be stale):",
                fallbackPlace.name
              );
              setIsBookmarkSheetOpen(false);
              setSelectedPlaceDetail(fallbackPlace);
              map.closePopup();
            }
          }
        }
      }
    };

    const attachPopupListeners = (e: LType.LeafletEvent) => {
      const popupNode = e.popup.getElement();
      if (popupNode) {
        // Bookmark button listeners
        const bookmarkButtons = popupNode.querySelectorAll(
          ".popup-bookmark-button"
        ); // Get NodeList
        bookmarkButtons.forEach((buttonNode: HTMLButtonElement) => {
          // buttonNode is Element by default
          const button = buttonNode as UsuncuButton;
          // Clean up previous listener specifically for this button, if any
          if (button._usuncuBookmarkHandler) {
            button.removeEventListener("click", button._usuncuBookmarkHandler);
          }
          // onPopupBookmarkClick is already defined in the outer scope of this useEffect
          button._usuncuBookmarkHandler = onPopupBookmarkClick;
          button.addEventListener("click", onPopupBookmarkClick);
        });

        // View Details button listeners
        const detailButtons = popupNode.querySelectorAll(
          ".view-details-button-popup"
        ); // Get NodeList
        detailButtons.forEach((buttonNode: HTMLButtonElement) => {
          // buttonNode is Element
          const button = buttonNode as UsuncuButton;
          if (button._usuncuDetailHandler) {
            button.removeEventListener("click", button._usuncuDetailHandler);
          }
          // onPopupViewDetailsClick is already defined in the outer scope of this useEffect
          button._usuncuDetailHandler = onPopupViewDetailsClick;
          button.addEventListener("click", onPopupViewDetailsClick);
        });
      }
    };

    map.on("popupopen", attachPopupListeners);

    // Cleanup: Remove event listener when component unmounts or map changes
    return () => {
      map.off("popupopen", attachPopupListeners);
      // Note: Dynamically added listeners to elements *inside* popups are harder to clean up perfectly
      // because the popup DOM is destroyed. The removeEventListener before adding new one mitigates duplicates.
    };
  }, [
    isLeafletLoaded,
    bookmarks,
    addBookmark,
    removeBookmark,
    processedPlaces,
    allPlacesFromStore,
    setSelectedPlaceDetail,
    setIsBookmarkSheetOpen,
  ]);

  // 6. Effect for CORE LOGIC (Shadow Calculation & processedPlaces Update)
  useEffect(() => {
    if (!isLeafletLoaded || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    // console.log("CORE LOGIC: Triggered", { sunPositionAvailable: !!sunPosition, numBuildings: buildings.length, numAllPlaces: allPlacesFromStore.length });

    // Manage shadowLayers locally within this effect if they are only rendered here
    // Or, if other effects need to know about shadow L.GeoJSON objects, keep in state but be careful.
    // For now, let's treat them as transient for rendering within this effect's cycle.

    // Clear previously rendered shadow L.GeoJSON objects from the map
    shadowLayers.forEach((layer) => map.removeLayer(layer));
    const newRenderedShadowLayers: LType.GeoJSON[] = []; // Temporary for this render cycle

    if (!sunPosition || buildings.length === 0) {
      const targetIsInSun = !!sunPosition;
      const newProcessed = allPlacesFromStore.map((p) => ({
        ...p,
        isInSun: targetIsInSun,
        relevantShadowPoint: getRelevantShadowPointForPlace(p, []),
      }));
      setProcessedPlaces(newProcessed); // Update Zustand
      setShadowLayers([]); // Update local state for shadow L.GeoJSON objects
      return;
    }

    const currentShadowFeatures: GeoJsonFeature<GeoJsonPolygon>[] = [];
    buildings.forEach((building) => {
      const shadowFeature = calculateShadowPolygon(building, sunPosition);
      if (shadowFeature) {
        currentShadowFeatures.push(
          shadowFeature as GeoJsonFeature<GeoJsonPolygon>
        );
      }
    });

    if (L) {
      currentShadowFeatures.forEach((shadowGeoJson) => {
        const shadowLayer = L!
          .geoJSON(shadowGeoJson, {
            style: {
              fillColor: "#555555",
              fillOpacity: 0.25,
              weight: 0,
              interactive: false,
            },
          })
          .addTo(map);
        newRenderedShadowLayers.push(shadowLayer);
      });
    }
    setShadowLayers(newRenderedShadowLayers); // Update local state for shadow L.GeoJSON objects

    const updatedPlaces = allPlacesFromStore.map((place) => {
      const relevantPoint = getRelevantShadowPointForPlace(place, buildings);
      const inSun = isLocationInSun(relevantPoint, currentShadowFeatures);
      return { ...place, isInSun: inSun, relevantShadowPoint: relevantPoint };
    });
    setProcessedPlaces(updatedPlaces); // Update Zustand
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sunPosition,
    buildings, // From Zustand
    allPlacesFromStore, // From Zustand (raw places)
    isLeafletLoaded,
    currentTime, // From Zustand
    setProcessedPlaces, // Zustand action (stable)
  ]);

  // 7. Effect for Marker Creation/Updating (Based on processedPlaces)
  useEffect(() => {
    if (!isLeafletLoaded || !mapInstanceRef.current || !L) {
      // If map not ready, or no processed places, ensure existing markers (if any) are cleared.
      if (markerInstances.size > 0) {
        // Check markerInstances from previous state
        markerInstances.forEach((marker) =>
          mapInstanceRef.current?.removeLayer(marker)
        );
        setMarkerInstances(new Map()); // Clear the state
      }
      return;
    }
    const map = mapInstanceRef.current;

    const newMarkerInstancesState = new Map<string, LType.Marker>();

    // Add/Update markers for current processedPlaces
    processedPlaces.forEach((place: Place) => {
      const pointToMark = place.relevantShadowPoint || place.center;
      if (!pointToMark) return;

      const isBookmarked = bookmarks.includes(place.id);
      const isSelected = selectedPlaceDetail?.id === place.id;

      const iconType: IconOptions["type"] =
        place.isInSun === true
          ? "sun"
          : place.isInSun === false
          ? "shade"
          : "unknown";

      const icon = createLeafletIcon({
        type: iconType,
        isBookmarked,
        isSelected,
      });
      if (!icon) return;

      let marker = markerInstances.get(place.id);

      if (marker) {
        marker.setLatLng([pointToMark.lat, pointToMark.lng]);
        marker.setIcon(icon);
        marker.setZIndexOffset(isSelected ? 2000 : isBookmarked ? 1000 : 0);
        marker.setIcon(icon);
        const tooltipContent = `
            <div class="p-0 m-0">
              <h4 class="font-semibold text-xs m-0 p-0">${
                place.name || "Unnamed Place"
              }</h4>
              <p class="text-xs text-muted-foreground m-0 p-0 capitalize">${
                place.tags?.amenity?.replace(/_/g, " ") || "Place"
              }</p>
            </div>
          `;
        const detailPopupContent = `
          <div class="p-1 max-w-xs">
            <button
                class="popup-bookmark-button p-1 -mr-1 -mt-1 text-muted-foreground hover:text-primary"
                data-place-id="${place.id}"
                data-place-name="${place.name || "Place"}"
                title="${isBookmarked ? "Remove bookmark" : "Add bookmark"}"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${
                  isBookmarked ? "currentColor" : "none"
                }" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            <div class="flex justify-between items-start">
              <div>
                <h3 class="font-semibold text-md mb-0.5">${
                  place.name || "Unnamed Place"
                }</h3>
                <p class="text-xs text-muted-foreground capitalize mb-1">${
                  place.tags?.amenity?.replace(/_/g, " ") || "Place"
                }</p>
              </div>
              <button
                class="popup-bookmark-button p-1 -mr-1 -mt-1 text-muted-foreground hover:text-primary"
                data-place-id="${place.id}"
                data-place-name="${place.name || "Place"}"
                title="${isBookmarked ? "Remove bookmark" : "Add bookmark"}"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${
                  isBookmarked ? "currentColor" : "none"
                }" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
            </div>
            ${
              place.tags?.cuisine
                ? `<p class="text-xs capitalize"><span class="font-medium">Cuisine:</span> ${place.tags.cuisine.replace(
                    /_/g,
                    " "
                  )}</p>`
                : ""
            }
            ${
              place.tags?.["addr:street"]
                ? `<p class="text-xs"><span class="font-medium">Address:</span> ${
                    place.tags["addr:street"]
                  } ${place.tags?.["addr:housenumber"] || ""}</p>`
                : ""
            }
            <p class="text-sm font-medium mt-1.5">Currently: ${
              place.isInSun === null
                ? "Checking..."
                : place.isInSun
                ? "☀️ In the Sun"
                : "🌙 In the Shade"
            }</p>
            <button class="mt-2 p-1 text-xs text-blue-600 hover:underline view-details-button-popup" data-place-id="${
              place.id
            }">View More Details</button>
          </div>
        `;
        marker.unbindTooltip().bindTooltip(tooltipContent, {
          permanent: false, // Only show on hover
          direction: "top", // Position above the marker
          offset: L!.point(0, -24), // Adjust offset as needed from iconAnchor
          sticky: true, // Follows the mouse (can sometimes help with flickering)
        });
        marker.unbindPopup().bindPopup(detailPopupContent, { minWidth: 240 });
      } else {
        // Create new marker
        marker = L!
          .marker([pointToMark.lat, pointToMark.lng], {
            icon,
            interactive: true,
            zIndexOffset: isSelected ? 2000 : isBookmarked ? 1000 : 0,
          })
          .addTo(map);
        const tooltipContent = `
            <div class="custom-usuncu-tooltip p-2 rounded-md shadow-lg bg-popover text-popover-foreground border border-border text-xs">
  <div class="flex items-center mb-0.5">
    <!-- Optional Sun/Moon Icon if place.isInSun is available and you want it this small -->
    <!-- ${
      place.isInSun === true
        ? '<svg class="w-3 h-3 text-orange-500 mr-1.5" ...sun_svg_path...</svg>'
        : ""
    } -->
    <!-- ${
      place.isInSun === false
        ? '<svg class="w-3 h-3 text-blue-500 mr-1.5" ...moon_svg_path...</svg>'
        : ""
    } -->
    <h5 class="font-semibold leading-tight truncate">${
      place.name || "Unnamed Place"
    }</h5>
  </div>
  <p class="text-muted-foreground capitalize leading-tight truncate">${
    place.tags?.amenity?.replace(/_/g, " ") || "Place"
  }</p>
</div>
          `;

        marker.bindTooltip(tooltipContent, {
          permanent: false, // Only show on hover
          direction: "top", // Position above the marker
          offset: L!.point(0, -24), // Adjust offset as needed from iconAnchor
          sticky: true, // Follows the mouse (can sometimes help with flickering)
        });
        newMarkerInstancesState.set(place.id, marker);
      }
    });

    // Remove markers from the map that were in the old state but not in the new one
    markerInstances.forEach((oldMarker, placeId) => {
      if (!newMarkerInstancesState.has(placeId)) {
        // console.log("MARKER CREATION/UPDATE: Removing marker no longer in processedPlaces:", placeId);
        map.removeLayer(oldMarker);
      }
    });

    setMarkerInstances(newMarkerInstancesState);
  }, [
    isLeafletLoaded,
    processedPlaces, // Primary driver
    bookmarks, // Affects icon and popup content
    selectedPlaceDetail, // Affects icon
  ]);

  // 8. Effect for Toggling Marker Visibility (Based on Filters)
  useEffect(() => {
    if (
      !isLeafletLoaded ||
      !mapInstanceRef.current ||
      markerInstances.size === 0
    )
      return;
    const map = mapInstanceRef.current;
    const nameQueryLower = amenityNameQuery.toLowerCase().trim();

    markerInstances.forEach((marker, placeId) => {
      const place = processedPlaces.find((p) => p.id === placeId); // Get the latest place data
      if (!place) {
        // Should not happen if markerInstanceMap is in sync with processedPlaces
        if (map.hasLayer(marker)) map.removeLayer(marker);
        return;
      }

      let passesSunShadeFilter = false;
      if (sunShadeFilter === "all") {
        passesSunShadeFilter = true;
      } else if (place.isInSun !== null && place.isInSun !== undefined) {
        passesSunShadeFilter =
          sunShadeFilter === "sun" ? place.isInSun : !place.isInSun;
      }

      let passesNameFilter = true;
      if (nameQueryLower) {
        const placeNameLower = (place.name || "").toLowerCase();
        passesNameFilter = placeNameLower.includes(nameQueryLower);
      }

      if (passesSunShadeFilter && passesNameFilter) {
        if (!map.hasLayer(marker)) {
          // Add if not already on map
          marker.addTo(map);
        }
        // marker.setOpacity(1); // If you were using opacity to hide
      } else {
        if (map.hasLayer(marker)) {
          // Remove if on map but shouldn't be
          map.removeLayer(marker);
        }
        // marker.setOpacity(0.1); // Example of dimming instead of removing
      }
    });
  }, [
    isLeafletLoaded,
    processedPlaces,
    sunShadeFilter,
    amenityNameQuery,
    markerInstances,
  ]);

  return <div ref={mapContainerRef} className="h-full w-full bg-muted" />;
};

export default MapComponent;
