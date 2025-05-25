// hooks/useSunAlerts.ts
import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/appStore";
import { Place, Building } from "@/lib/types";
import { SunPosition } from "@/hooks/useSunPosition"; // Ensure this is exported correctly
import SunCalc from "suncalc";
import {
  isLocationInSun,
  getRelevantShadowPointForPlace,
  calculateShadowPolygon,
} from "@/lib/shadow";
// Use standard GeoJSON types for consistency when declaring arrays of features
import { Feature as GeoJsonFeature, Polygon as GeoJsonPolygon } from "geojson";
import * as turf from "@turf/turf"; // Needed for the building filter optimization

const CHECK_INTERVAL_MS = 1 * 60 * 1000;
const NOTIFICATION_LEAD_TIME_MS = 15 * 60 * 1000;
const PREDICTION_HORIZON_MS = 30 * 60 * 1000;
const PREDICTION_STEP_MS = 5 * 60 * 1000;

interface NotifiedEvent {
  placeId: string;
  predictedSunTime: number;
}

export function useSunAlerts() {
  const { bookmarks, places: allPlaces, buildings, mapCenter } = useAppStore();
  const notifiedEventsRef = useRef<NotifiedEvent[]>([]);

  useEffect(() => {
    const alertsGloballyEnabled =
      typeof window !== "undefined" &&
      localStorage.getItem("sunAlertsEnabled") === "true";
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      Notification.permission !== "granted" ||
      !alertsGloballyEnabled
    ) {
      return;
    }

    const intervalId = setInterval(async () => {
      if (bookmarks.length === 0 || allPlaces.length === 0 || !mapCenter) {
        // Removed buildings.length === 0 check here, as it might be empty if zoomed out
        return;
      }
      //   ("Usuncu SunAlerts: Checking bookmarked places...");
      const now = Date.now();
      notifiedEventsRef.current = notifiedEventsRef.current.filter(
        (event) => now < event.predictedSunTime + PREDICTION_HORIZON_MS * 2
      );

      for (const bookmarkId of bookmarks) {
        const place = allPlaces.find((p) => p.id === bookmarkId);
        if (!place || !place.center || !place.id) continue;

        const existingNotification = notifiedEventsRef.current.find(
          (event) => event.placeId === place.id && now < event.predictedSunTime
        );
        if (existingNotification) continue;

        let currentlyInSun = false;
        const currentSunPosCalc = SunCalc.getPosition(
          new Date(now),
          place.center.lat,
          place.center.lng
        );
        if (currentSunPosCalc.altitude > 0 && buildings.length > 0) {
          // Only check if buildings data is available
          const relevantPointNow = getRelevantShadowPointForPlace(
            place,
            buildings
          );
          const currentShadows: GeoJsonFeature<GeoJsonPolygon>[] = [];
          // OPTIMIZATION for current shadows: only buildings near the place
          const relevantBuildingsNow = buildings.filter((b) => {
            if (!b.geometry || !place.center) return false;
            try {
              const buildingFeature = turf.feature(b.geometry);
              const buildingCenter = turf.centroid(
                buildingFeature as turf.AllGeoJSON
              ); // Cast to AllGeoJSON
              const distance = turf.distance(
                turf.point([place.center.lng, place.center.lat]),
                buildingCenter,
                { units: "kilometers" }
              );
              return distance < 2;
            } catch (e) {
              return false;
            } // If error, exclude building from this check
          });
          relevantBuildingsNow.forEach((building) => {
            const shadow = calculateShadowPolygon(
              building,
              currentSunPosCalc as SunPosition
            );
            if (shadow)
              currentShadows.push(shadow as GeoJsonFeature<GeoJsonPolygon>);
          });
          currentlyInSun = isLocationInSun(relevantPointNow, currentShadows);
        } else if (currentSunPosCalc.altitude > 0 && buildings.length === 0) {
          // No buildings data, assume it's in sun if sun is up (simplification)
          currentlyInSun = true;
        }

        if (currentlyInSun) continue;

        for (
          let t_offset = PREDICTION_STEP_MS;
          t_offset <= PREDICTION_HORIZON_MS;
          t_offset += PREDICTION_STEP_MS
        ) {
          const futureTime = new Date(now + t_offset);
          const futureSunPosition = SunCalc.getPosition(
            futureTime,
            place.center.lat,
            place.center.lng
          );

          if (futureSunPosition.altitude > 0) {
            const relevantPointFuture = getRelevantShadowPointForPlace(
              place,
              buildings
            );
            const futureShadowsForNotification: GeoJsonFeature<GeoJsonPolygon>[] =
              [];

            if (buildings.length > 0) {
              // Only calculate shadows if buildings exist
              const relevantBuildingsFuture = buildings.filter((b) => {
                if (!b.geometry || !place.center) return false;
                try {
                  const buildingFeature = turf.feature(b.geometry);
                  const buildingCenter = turf.centroid(
                    buildingFeature as turf.AllGeoJSON
                  );
                  const distance = turf.distance(
                    turf.point([place.center.lat, place.center.lat]),
                    buildingCenter,
                    { units: "kilometers" }
                  );
                  return distance < 2; // Consider buildings within 2km
                } catch (e) {
                  return false;
                }
              });

              relevantBuildingsFuture.forEach((building) => {
                const shadow = calculateShadowPolygon(
                  building,
                  futureSunPosition as SunPosition
                );
                if (shadow)
                  futureShadowsForNotification.push(
                    shadow as GeoJsonFeature<GeoJsonPolygon>
                  );
              });
            }

            // If no buildings to cast shadows, or after calculating shadows:
            const willBeInSun =
              (buildings.length === 0 && futureSunPosition.altitude > 0.1) || // If no buildings, check if sun is reasonably high
              (buildings.length > 0 &&
                isLocationInSun(
                  relevantPointFuture,
                  futureShadowsForNotification
                ));

            if (willBeInSun) {
              if (t_offset <= NOTIFICATION_LEAD_TIME_MS) {
                new Notification("☀️ Usuncu Sun Alert!", {
                  body: `${
                    place.name || "A bookmarked spot"
                  } is expected to be in the sun in about ${Math.round(
                    t_offset / (60 * 1000)
                  )} minutes!`,
                  icon: "/logo_transparent.png",
                  tag: `sun-alert-${place.id}-${futureTime.getTime()}`, // Unique tag
                  // renotify: false, // REMOVED
                });
                notifiedEventsRef.current.push({
                  placeId: place.id,
                  predictedSunTime: futureTime.getTime(),
                });
                break;
              }
            }
          }
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [bookmarks, allPlaces, buildings, mapCenter]);
}
