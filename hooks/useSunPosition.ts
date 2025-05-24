// hooks/useSunPosition.ts
import { useState, useEffect } from "react";
import SunCalc from "suncalc";
import { useAppStore } from "@/store/appStore";

export interface SunPosition {
  azimuth: number; // Sun azimuth in radians (direction along the horizon, measured from south to west)
  // e.g., S=0, W=PI/2, N=PI, E=3PI/2 or -PI/2
  altitude: number; // Sun altitude above the horizon in radians (0 at horizon, PI/2 at zenith)
}

/**
 * Calculates the sun's position for a given location and time.
 * @param lat Latitude of the observer.
 * @param lng Longitude of the observer.
 * @returns SunPosition object { azimuth, altitude } or null if inputs are invalid or sun is not up.
 */
export function useSunPosition(lat?: number, lng?: number): SunPosition | null {
  const currentTime = useAppStore((state) => state.currentTime);
  const [sunPosition, setSunPosition] = useState<SunPosition | null>(null);

  useEffect(() => {
    if (typeof lat === "number" && typeof lng === "number") {
      const position = SunCalc.getPosition(currentTime, lat, lng);
      // SunCalc's azimuth is from south, clockwise. Altitude is from horizon.
      // We can directly use these values.
      // position.altitude > 0 means the sun is above the horizon.
      if (position.altitude > 0) {
        setSunPosition({
          azimuth: position.azimuth,
          altitude: position.altitude,
        });
      } else {
        setSunPosition(null); // Sun is below horizon
      }
    } else {
      setSunPosition(null); // Invalid coordinates
    }
  }, [currentTime, lat, lng]); // Re-calculate when time or location changes

  return sunPosition;
}
