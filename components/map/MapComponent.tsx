// components/map/MapComponent.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type LType from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAppStore } from "@/store/appStore";
import { Place, Building, BoundingBox } from "@/lib/types";
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

const createLeafletIcon = (
  color: string,
  type: "sun" | "shade"
): LType.DivIcon | undefined => {
  if (!L) return undefined;
  const iconHtml =
    type === "sun"
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
  return L.divIcon({
    className: "custom-place-icon",
    html: iconHtml,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
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
    setMapBoundsForQuery,
    places: allPlacesFromStore,
    buildings,
    currentTime,
    sunShadeFilter,
    bookmarks,
    addBookmark,
    removeBookmark,
  } = useAppStore();

  const debouncedSetMapBoundsForQuery = useDebouncedCallback(
    (bounds: BoundingBox) => {
      // console.log("MapComponent: DEBOUNCED setting mapBoundsForQuery:", bounds);
      setMapBoundsForQuery(bounds);
    },
    750 // Debounce time in milliseconds (e.g., 750ms)
  );

  const sunPosition = useSunPosition(mapCenter.lat, mapCenter.lng); // Use mapCenter for sun position calculation

  const [placeMarkers, setPlaceMarkers] = useState<LType.Marker[]>([]);
  const [shadowLayers, setShadowLayers] = useState<LType.GeoJSON[]>([]);
  const [processedPlaces, setProcessedPlaces] = useState<Place[]>([]);
  const [isLeafletLoaded, setIsLeafletLoaded] = useState(false);

  // Effect to handle clicks on bookmark buttons within Leaflet popups
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    const onPopupBookmarkClick = (e: LType.LeafletEvent) => {
      const target = e.target as HTMLElement; // The clicked element
      if (target.classList.contains("popup-bookmark-button")) {
        const placeId = target.dataset.placeId;
        if (placeId) {
          const isBookmarked = bookmarks.includes(placeId);
          if (isBookmarked) {
            removeBookmark(placeId);
            toast.success(
              `"${target.dataset.placeName || "Place"}" removed from bookmarks.`
            );
          } else {
            addBookmark(placeId);
            toast.success(
              `"${target.dataset.placeName || "Place"}" added to bookmarks!`
            );
          }
          // Note: The popup content won't automatically re-render to show the new bookmark state.
          // A more advanced solution would involve re-opening/updating the popup content or using react-leaflet.
          // For now, the toast provides feedback. The next time the popup is opened, it will reflect the new state.
          map.closePopup(); // Close popup to allow reopening with updated state if marker re-renders
        }
      }
    };

    map.on("popupopen", (e) => {
      const popupNode = e.popup.getElement();
      if (popupNode) {
        const buttons = popupNode.querySelectorAll(".popup-bookmark-button");
        buttons.forEach((button) => {
          // Remove old listener before adding new one to prevent duplicates if popup is reused
          button.removeEventListener("click", onPopupBookmarkClick as any); // Cast as any to satisfy TS
          button.addEventListener("click", onPopupBookmarkClick as any);
        });
      }
    });

    // Cleanup: Remove event listener when component unmounts or map changes
    return () => {
      // map.off('click', onPopupBookmarkClick as any); // This was wrong, should be popup specific
      // How to clean up listeners attached to specific DOM elements inside popups is tricky
      // as popups are destroyed. The 'popupopen' listener on map is the main one to clean.
      map.off("popupopen");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookmarks, addBookmark, removeBookmark, isLeafletLoaded]); // Re-run if bookmark state changes to update listeners (though this approach might be simplified)

  useEffect(() => {
    if (typeof window !== "undefined") {
      import("leaflet").then((leafletModule) => {
        L = leafletModule.default;
        if (!L) return;
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          /* your icon URLs */
        });
        setIsLeafletLoaded(true);
        if (mapContainerRef.current && !mapInstanceRef.current) {
          const map = L.map(mapContainerRef.current).setView(
            [mapCenter.lat, mapCenter.lng],
            mapZoom
          );

          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OSM",
          }).addTo(map);
          mapInstanceRef.current = map;
          setMapRef(map);

          if (mapContainerRef.current && !mapInstanceRef.current) {
            const handleMapViewChange = () => {
              if (!mapInstanceRef.current) return;
              const currentMap = mapInstanceRef.current;
              const newCenter = currentMap.getCenter();
              const newZoom = currentMap.getZoom();
              setMapCenterAndZoom(
                { lat: newCenter.lat, lng: newCenter.lng },
                newZoom
              );

              // Update mapBoundsForQuery for data refetching
              const bounds = currentMap.getBounds();
              const newMapBounds: BoundingBox = [
                bounds.getSouth(),
                bounds.getWest(),
                bounds.getNorth(),
                bounds.getEast(),
              ];

              debouncedSetMapBoundsForQuery(newMapBounds);
            };

            map.on("moveend", handleMapViewChange);
            map.on("zoomend", handleMapViewChange);
          }
        }
      });
    }
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        setMapRef(null);
      }
    };
  }, [mapCenter.lat, mapCenter.lng, mapZoom, setMapRef, setMapCenterAndZoom]);

  // Effect to update map view when mapCenter or mapZoom from store changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (map && isLeafletLoaded) {
      const currentMapCenter = map.getCenter();
      // Only flyTo if the store's center/zoom is significantly different from map's current view
      if (
        currentMapCenter.lat.toFixed(4) !== mapCenter.lat.toFixed(4) ||
        currentMapCenter.lng.toFixed(4) !== mapCenter.lng.toFixed(4) ||
        map.getZoom() !== mapZoom
      ) {
        map.flyTo([mapCenter.lat, mapCenter.lng], mapZoom);
      }
    }
  }, [mapCenter, mapZoom, isLeafletLoaded]); // Depend on store's mapCenter and mapZoom

  useEffect(() => {
    // console.log(`CORE LOGIC: Triggered. Leaflet: ${isLeafletLoaded}, Sun: ${!!sunPosition}, Buildings: ${buildings.length}, AllPlaces: ${allPlacesFromStore.length}`);
    if (!isLeafletLoaded || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (!sunPosition || buildings.length === 0) {
      shadowLayers.forEach((layer) => map.removeLayer(layer));
      setShadowLayers([]);
      const anySunny = processedPlaces.some((p) => p.isInSun); // Check before potentially modifying processedPlaces
      if (!sunPosition && anySunny) {
        // console.log("CORE LOGIC: Sun down, marking all processed as shaded.");
        setProcessedPlaces((prev) =>
          prev.map((p) => ({ ...p, isInSun: false }))
        );
      } else if (
        !sunPosition &&
        allPlacesFromStore.length > 0 &&
        (!processedPlaces.length || !anySunny)
      ) {
        // This condition means: sun is down, we have places from the store,
        // and either processedPlaces is empty OR no places in processedPlaces were marked as sunny (e.g. first load at night)
        // console.log("CORE LOGIC: Sun down initially, marking all from store as shaded.");
        setProcessedPlaces(
          allPlacesFromStore.map((p) => ({
            ...p,
            isInSun: false,
            relevantShadowPoint: getRelevantShadowPointForPlace(p, buildings), // buildings might be [] here, getRelevant should handle
          }))
        );
      }
      return;
    }

    const currentShadowFeatures: GeoJsonFeature<GeoJsonPolygon>[] = [];
    buildings.forEach((building) => {
      const shadowFeatureFromCalc = calculateShadowPolygon(
        building,
        sunPosition
      );
      if (shadowFeatureFromCalc) {
        currentShadowFeatures.push(
          shadowFeatureFromCalc as GeoJsonFeature<GeoJsonPolygon>
        );
      }
    });

    shadowLayers.forEach((layer) => map.removeLayer(layer));
    const newShadowLayers: LType.GeoJSON[] = [];
    currentShadowFeatures.forEach((shadowGeoJson) => {
      const shadowLayer = L!
        .geoJSON(shadowGeoJson, {
          style: { fillColor: "black", fillOpacity: 0.3, weight: 0 },
        })
        .addTo(map);
      newShadowLayers.push(shadowLayer);
    });
    setShadowLayers(newShadowLayers);

    const updatedPlaces = allPlacesFromStore.map((place) => {
      const relevantPoint = getRelevantShadowPointForPlace(place, buildings);
      const inSun = isLocationInSun(relevantPoint, currentShadowFeatures);
      return { ...place, isInSun: inSun, relevantShadowPoint: relevantPoint };
    });
    // console.log(`CORE LOGIC: Setting processedPlaces. Count: ${updatedPlaces.length}. First place: ${updatedPlaces[0]?.name}, Sun: ${updatedPlaces[0]?.isInSun}`);
    setProcessedPlaces(updatedPlaces);
  }, [
    sunPosition,
    buildings,
    allPlacesFromStore,
    isLeafletLoaded,
    currentTime,
  ]); // Removed processedPlaces

  useEffect(() => {
    // console.log(`MARKER RENDER: Triggered. Processed: ${processedPlaces.length}, Filter: ${sunShadeFilter}, Leaflet: ${isLeafletLoaded}`);
    if (!isLeafletLoaded || !mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    placeMarkers.forEach((marker) => map.removeLayer(marker));
    const newMarkers: LType.Marker[] = [];

    const placesToDisplay = processedPlaces.filter((place) => {
      if (sunShadeFilter === "all") return true; // CORRECTED: Show all if filter is 'all'
      if (place.isInSun === null || place.isInSun === undefined) return false;
      return sunShadeFilter === "sun" ? place.isInSun : !place.isInSun;
    });
    // console.log(`MARKER RENDER: placesToDisplay after filter: ${placesToDisplay.length}`);

    placesToDisplay.forEach((place: Place) => {
      const pointToMark = place.relevantShadowPoint || place.center;
      if (pointToMark) {
        const isBookmarked = bookmarks.includes(place.id);
        const icon = createLeafletIcon(
          place.isInSun === null
            ? "grey"
            : place.isInSun
            ? "orange"
            : "slategray",
          place.isInSun === null ? "shade" : place.isInSun ? "sun" : "shade" // CORRECTED: default icon type
        );
        if (icon) {
          const popupContent = `
            <div class="p-1 max-w-xs">
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
            </div>
          `;
          const marker = L!
            .marker([pointToMark.lat, pointToMark.lng], { icon })
            .addTo(map)
            .bindPopup(popupContent, { minWidth: 240 }); // Increased minWidth
          newMarkers.push(marker);
        }
      }
    });
    setPlaceMarkers(newMarkers);
    // console.log(`MARKER RENDER: newMarkers count: ${newMarkers.length}`);
  }, [processedPlaces, sunShadeFilter, isLeafletLoaded]);

  return <div ref={mapContainerRef} className="h-full w-full bg-muted" />;
};

export default MapComponent;
