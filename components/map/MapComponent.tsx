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
  MIN_SUN_ALTITUDE_RAD,
} from "@/lib/shadow";
import { Feature as GeoJsonFeature, Polygon as GeoJsonPolygon } from "geojson";
import { useDebouncedCallback } from "use-debounce";
import { toast } from "sonner";
import { useTranslation } from "@/context/i18nContext";
import { useTheme } from "next-themes";

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

const MIN_ZOOM_FOR_SHADOWS = 16; // Define zoom threshold for showing shadows. Adjust as needed.

const createLeafletIcon = (options: IconOptions): LType.DivIcon | undefined => {
  if (!L) return undefined;

  // Determine if current theme is light (assuming 'light' is the explicit value for light theme)
  // This part depends on how you access the resolved theme.
  // If `appTheme` is available here (passed as a prop or from a shared context/hook specifically for this function), use it.
  // For simplicity in this snippet, I'll assume a way to get it. If not, we might need to pass it to createLeafletIcon.
  // Let's assume `document.documentElement.classList.contains('dark')` can be a proxy if window is defined.
  // However, it's better if the theme state is explicitly passed or accessible.

  // For now, let's assume we can't easily get appTheme here without prop drilling.
  // So we'll use Tailwind's dark: prefix as before, and focus on the non-dark (light mode) colors.

  let baseColorClass: string; // For the SVG icon stroke/fill
  let iconFillColor: string; // For the circular background of the marker
  let iconSvgPath = `<circle cx="12" cy="12" r="7" fill="currentColor" opacity="0.5"/> <circle cx="12" cy="12" r="3" fill="white"/>`; // Default dot

  if (options.type === "sun") {
    // LIGHT MODE SUN: Brighter, more vibrant
    iconFillColor = "bg-amber-400 dark:bg-orange-900/60"; // Brighter amber for light, slightly more opaque dark
    baseColorClass = "text-white dark:text-orange-300"; // White icon on amber, light orange on dark orange

    // Dark mode SUN (can also be tweaked if needed)
    // iconFillColor = "dark:bg-orange-500"; // Example: A more solid orange for dark mode background
    // baseColorClass = "dark:text-orange-100";

    iconSvgPath = `<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2"/><path d="M12 19.5v2"/><path d="m5.23 5.23 1.41 1.41"/><path d="m17.36 17.36 1.41 1.41"/><path d="M2.5 12h2"/><path d="M19.5 12h2"/><path d="m6.64 17.36-1.41 1.41"/><path d="m18.77 5.23-1.41 1.41"/>`;
  } else if (options.type === "shade") {
    // LIGHT MODE SHADE: More distinct blue
    iconFillColor = "bg-sky-500 dark:bg-sky-800/70"; // Vibrant sky blue for light, slightly more opaque dark
    baseColorClass = "text-white dark:text-sky-300"; // White icon on sky blue

    // Dark mode SHADE (can also be tweaked)
    // iconFillColor = "dark:bg-blue-600";
    // baseColorClass = "dark:text-blue-100";

    iconSvgPath = `<path d="M12 3a6.36 6.36 0 0 0 9 9 9 9 0 1 1-9-9Z"/>`;
  } else {
    // Unknown
    // LIGHT MODE UNKNOWN: Clear neutral
    iconFillColor = "bg-slate-200 dark:bg-slate-700"; // Light grey for light mode
    baseColorClass = "text-slate-700 dark:text-slate-300"; // Darker grey icon for light mode
  }

  let iconSize = 28;
  let wrapperClasses = `custom-place-icon rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ease-in-out`;
  let borderClasses = "border-2 border-transparent";

  if (options.isSelected) {
    iconSize = 36;
    // Selected border can use primary color, which adapts to theme via CSS variables if set up in globals.css
    // Or define explicitly:
    borderClasses = `border-4 border-blue-600 dark:border-sky-400 shadow-xl ring-2 ring-offset-1 ring-offset-background dark:ring-offset-background ring-blue-600/50 dark:ring-sky-400/50`;
    // Using Tailwind's primary color (if defined)
    // borderClasses = `border-4 border-primary dark:border-primary shadow-xl ring-2 ring-offset-1 ring-offset-background dark:ring-offset-background ring-primary/50`;
  } else if (options.isBookmarked) {
    // Bookmark border should also be vibrant
    borderClasses = `border-2 border-pink-500 dark:border-pink-400`; // Example: Pink for bookmark
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
           stroke="currentColor" 
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
  const tileLayerRef = useRef<LType.TileLayer | null>(null); // Ref for the tile layer

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
  } = useAppStore();

  const { theme: appTheme } = useTheme(); // Get current theme from next-themes
  const sunPosition = useSunPosition(mapCenter.lat, mapCenter.lng);
  const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);
  const [markerInstances, setMarkerInstances] = useState<
    Map<string, LType.Marker>
  >(new Map());
  const [shadowLayers, setShadowLayers] = useState<LType.GeoJSON[]>([]);
  const { t } = useTranslation();

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
  }, []);

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

  const debouncedProcessMapViewChange = useDebouncedCallback(
    processMapViewChange,
    300
  );

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
      setMapRef(map);

      const initialMapCenter = map.getCenter();
      const initialMapZoom = map.getZoom();
      setMapCenterAndZoom(
        { lat: initialMapCenter.lat, lng: initialMapCenter.lng },
        initialMapZoom,
        false
      );

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isLeafletLoaded,
    debouncedProcessMapViewChange,
    setMapRef,
    setMapCenterAndZoom,
  ]);

  // Effect to UPDATE THE TILE LAYER based on theme (and on initial map load)
  useEffect(() => {
    if (!mapInstanceRef.current || !L || !isLeafletLoaded) return; // Ensure map and Leaflet are ready
    const map = mapInstanceRef.current;

    // Remove existing tile layer if it exists
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const stadiaApiKey = process.env.NEXT_PUBLIC_STADIA_API_KEY;
    let newTileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"; // Fallback
    let newAttribution =
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap contributors</a>';
    let layerOptions: L.TileLayerOptions = {
      attribution: newAttribution,
      maxZoom: 19,
    };

    if (stadiaApiKey) {
      if (appTheme === "dark") {
        newTileUrl = `https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png?api_key=${stadiaApiKey}`;
      } else {
        // Default to light theme if not 'dark' or theme is undefined initially
        newTileUrl = `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${stadiaApiKey}`;
      }
      newAttribution =
        '© <a href="https://www.stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a>, © <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OSM contributors</a>';
      layerOptions = { attribution: newAttribution, maxZoom: 20 }; // Removed ext property
    } else {
      console.warn(
        "Stadia Maps API key not found. Falling back to default OSM tiles."
      );
    }

    const newLayer = L.tileLayer(newTileUrl, layerOptions);
    newLayer.addTo(map);
    tileLayerRef.current = newLayer;
  }, [appTheme, isLeafletLoaded]); // Re-run when appTheme changes or Leaflet loads

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
        map.flyTo([mapCenter.lat, mapCenter.lng], mapZoom, {
          animate: true,
          duration: 1.0, // Adjust duration for a nice flight
        });
      }
    }
  }, [mapCenter, mapZoom, isLeafletLoaded]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map && isLeafletLoaded) {
      const timer = setTimeout(() => {
        map.invalidateSize({ animate: true });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [isBookmarkSheetOpen, selectedPlaceDetail, isLeafletLoaded]);

  // 5. Effect for Popup Event Listeners
  useEffect(() => {
    if (!isLeafletLoaded || !mapInstanceRef.current) {
      return;
    }

    const map = mapInstanceRef.current;

    const onPopupBookmarkClick = (e: Event) => {
      const currentTarget = e.currentTarget as HTMLElement;
      if (currentTarget.classList.contains("popup-bookmark-button")) {
        const placeId = currentTarget.dataset.placeId;
        const placeName = currentTarget.dataset.placeName;
        if (placeId) {
          const isBookmarked = bookmarks.includes(placeId);
          if (isBookmarked) {
            removeBookmark(placeId);
            toast.success(
              t("mapComponent.removedToast", {
                name: placeName || t("mapComponent.placeLabel"),
              })
            );
          } else {
            addBookmark(placeId);
            toast.success(
              t("mapComponent.addedToast", {
                name: placeName || t("mapComponent.placeLabel"),
              })
            );
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
          const placeToDetail = processedPlaces.find((p) => p.id === placeId);
          if (placeToDetail) {
            setIsBookmarkSheetOpen(false);
            setSelectedPlaceDetail(placeToDetail);
            map.closePopup();
          } else {
            console.warn(
              "MapComponent: View Details Clicked: Place not found in processedPlaces for ID:",
              placeId
            );
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
        const bookmarkButtons = popupNode.querySelectorAll(
          ".popup-bookmark-button"
        );
        bookmarkButtons.forEach((buttonNode: HTMLButtonElement) => {
          const button = buttonNode as UsuncuButton;
          if (button._usuncuBookmarkHandler) {
            button.removeEventListener("click", button._usuncuBookmarkHandler);
          }
          button._usuncuBookmarkHandler = onPopupBookmarkClick;
          button.addEventListener("click", onPopupBookmarkClick);
        });

        const detailButtons = popupNode.querySelectorAll(
          ".view-details-button-popup"
        );
        detailButtons.forEach((buttonNode: HTMLButtonElement) => {
          const button = buttonNode as UsuncuButton;
          if (button._usuncuDetailHandler) {
            button.removeEventListener("click", button._usuncuDetailHandler);
          }
          button._usuncuDetailHandler = onPopupViewDetailsClick;
          button.addEventListener("click", onPopupViewDetailsClick);
        });
      }
    };

    map.on("popupopen", attachPopupListeners);

    return () => {
      map.off("popupopen", attachPopupListeners);
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
    t,
  ]);

  // 6. Effect for CORE LOGIC (Shadow Calculation & processedPlaces Update)
  useEffect(() => {
    if (!isLeafletLoaded || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    // Clear previous shadows before any calculations
    shadowLayers.forEach((layer) => map.removeLayer(layer));
    const newRenderedShadowLayers: LType.GeoJSON[] = [];

    // Use mapZoom from the store, which is updated on 'moveend' and 'zoomend'
    const currentEffectiveZoom = mapZoom;

    // Condition to skip shadow calculation:
    // - No sunPosition data
    // - Sun is below horizon (or very close to it)
    // - No buildings loaded for the current view
    if (
      !sunPosition ||
      sunPosition.altitude <= MIN_SUN_ALTITUDE_RAD ||
      buildings.length === 0 ||
      currentEffectiveZoom < MIN_ZOOM_FOR_SHADOWS
    ) {
      shadowLayers.forEach((layer) => map.removeLayer(layer)); // Ensure old ones are gone
      setShadowLayers([]); // Clear shadow layers state

      const targetIsInSun =
        !!sunPosition && sunPosition.altitude > MIN_SUN_ALTITUDE_RAD;
      // If zoomed out too far, or no buildings/sun, update places without shadow consideration
      const newProcessed = allPlacesFromStore.map((p) => ({
        ...p,
        isInSun: targetIsInSun,
        relevantShadowPoint: getRelevantShadowPointForPlace(p, []),
      }));
      setProcessedPlaces(newProcessed);
      return;
    }

    const currentShadowFeatures: GeoJsonFeature<GeoJsonPolygon>[] = [];
    buildings.forEach((building) => {
      const shadowFeature = calculateShadowPolygon(building, sunPosition);
      if (shadowFeature) {
        // Add building ID to properties if needed for debugging
        if (!shadowFeature.properties) shadowFeature.properties = {};
        shadowFeature.properties.buildingId = building.id;
        currentShadowFeatures.push(
          shadowFeature as GeoJsonFeature<GeoJsonPolygon>
        );
      }
    });

    if (L && currentShadowFeatures.length > 0) {
      let shadowOpacity = 0.35;
      // Optional: Adjust opacity based on sun altitude (Option 2 snippet)
      if (sunPosition.altitude < Math.PI / 9) {
        shadowOpacity = 0.25;
      }
      if (sunPosition.altitude < Math.PI / 18) {
        shadowOpacity = 0.2;
      }

      currentShadowFeatures.forEach((shadowGeoJson) => {
        const shadowLayer = L!
          .geoJSON(shadowGeoJson, {
            style: {
              fillColor: "#333333",
              fillOpacity: shadowOpacity, // Consider dynamic opacity here
              weight: 0,
              interactive: false,
            },
          })
          .addTo(map);
        newRenderedShadowLayers.push(shadowLayer);
      });
    }
    setShadowLayers(newRenderedShadowLayers);

    const updatedPlaces = allPlacesFromStore.map((place) => {
      const relevantPoint = getRelevantShadowPointForPlace(place, buildings);
      const inSun = isLocationInSun(relevantPoint, currentShadowFeatures);
      return { ...place, isInSun: inSun, relevantShadowPoint: relevantPoint };
    });
    setProcessedPlaces(updatedPlaces);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sunPosition,
    buildings,
    allPlacesFromStore,
    isLeafletLoaded,
    currentTime,
    setProcessedPlaces,
    mapZoom,
  ]);

  // 7. Effect for Marker Creation/Updating (Based on processedPlaces)
  useEffect(() => {
    if (!isLeafletLoaded || !mapInstanceRef.current || !L) {
      if (markerInstances.size > 0) {
        markerInstances.forEach((marker) =>
          mapInstanceRef.current?.removeLayer(marker)
        );
        setMarkerInstances(new Map());
      }
      return;
    }
    const map = mapInstanceRef.current;

    const newMarkerInstancesState = new Map<string, LType.Marker>();

    // Define the content strings once per place iteration
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

      // Define tooltip and popup content here, before the if/else block
      const tooltipContent = `
            <div class="custom-usuncu-tooltip p-2 rounded-md shadow-lg bg-popover text-popover-foreground border border-border text-xs">
  <div class="flex items-center mb-0.5">
    <h5 class="font-semibold leading-tight truncate">${
      place.name || t("mapComponent.unnamedPlace")
    }</h5>
  </div>
  <p class="text-muted-foreground capitalize leading-tight truncate">${
    place.tags?.amenity?.replace(/_/g, " ") || t("mapComponent.placeLabel")
  }</p>
</div>
          `;

      const detailPopupContent = `
          <div class="p-1 max-w-xs">
            <div class="flex justify-between items-start">
              <div>
                <h3 class="font-semibold text-md mb-0.5">${
                  place.name || t("mapComponent.unnamedPlace")
                }</h3>
                <p class="text-xs text-muted-foreground capitalize mb-1">${
                  place.tags?.amenity?.replace(/_/g, " ") ||
                  t("mapComponent.placeLabel")
                }</p>
              </div>
              <button
                class="popup-bookmark-button p-1 -mr-1 -mt-1 text-muted-foreground hover:text-primary"
                data-place-id="${place.id}"
                data-place-name="${place.name || t("mapComponent.placeLabel")}"
                title="${
                  isBookmarked
                    ? t("mapComponent.removeBookmark")
                    : t("mapComponent.addBookmark")
                }"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="${
                  isBookmarked ? "currentColor" : "none"
                }" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 0 0 1 2 2z"/>
                </svg>
              </button>
            </div>
            ${
              place.tags?.cuisine
                ? `<p class="text-xs capitalize"><span class="font-medium">${t(
                    "mapComponent.cuisine"
                  )}:</span> ${place.tags.cuisine.replace(/_/g, " ")}</p>`
                : ""
            }
            ${
              place.tags?.["addr:street"]
                ? `<p class="text-xs"><span class="font-medium">${t(
                    "mapComponent.address"
                  )}:</span> ${place.tags["addr:street"]} ${
                    place.tags?.["addr:housenumber"] || ""
                  }</p>`
                : ""
            }
            <p class="text-sm font-medium mt-1.5">${t(
              "mapComponent.currently"
            )} ${
        place.isInSun === null
          ? t("mapComponent.checking")
          : place.isInSun
          ? `☀️ ${t("mapComponent.inTheSun")}`
          : `🌙 ${t("mapComponent.inTheShade")}`
      }</p>
            <button class="mt-2 p-1 text-xs text-blue-600 hover:underline view-details-button-popup" data-place-id="${
              place.id
            }">${t("mapComponent.viewMoreDetails")}</button>
          </div>
        `;

      let marker = markerInstances.get(place.id);

      if (marker) {
        marker.setLatLng([pointToMark.lat, pointToMark.lng]);
        marker.setIcon(icon);
        marker.setZIndexOffset(isSelected ? 2000 : isBookmarked ? 1000 : 0);
        // Refresh tooltip and popup content for existing markers
        marker.unbindTooltip().bindTooltip(tooltipContent, {
          permanent: false,
          direction: "top",
          offset: L!.point(0, -24),
          sticky: true,
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

        // Bind tooltip for new markers
        marker.bindTooltip(tooltipContent, {
          permanent: false,
          direction: "top",
          offset: L!.point(0, -24),
          sticky: true,
        });
        marker.bindPopup(detailPopupContent, { minWidth: 240 });

        newMarkerInstancesState.set(place.id, marker);
      }
    });

    // Remove markers from the map that were in the old state but not in the new one
    markerInstances.forEach((oldMarker, placeId) => {
      if (!newMarkerInstancesState.has(placeId)) {
        map.removeLayer(oldMarker);
      }
    });

    setMarkerInstances(newMarkerInstancesState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLeafletLoaded, processedPlaces, bookmarks, selectedPlaceDetail, t]);

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
      const place = processedPlaces.find((p) => p.id === placeId);
      if (!place) {
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
          marker.addTo(map);
        }
      } else {
        if (map.hasLayer(marker)) {
          map.removeLayer(marker);
        }
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
