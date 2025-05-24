// hooks/useUserLocation.ts
import { useAppStore } from "@/store/appStore";
import { toast } from "sonner";

export function useUserLocation() {
  const { setUserCoordinates, processAndSetNewLocation } = useAppStore();

  const requestUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserCoordinates(coords); // Store raw GPS coordinates

          // Explicitly process this as the new target location
          processAndSetNewLocation(
            {
              lat: coords.lat,
              lng: coords.lng,
              displayName: "My Current Location",
              // boundingbox is not directly available from GPS, processAndSetNewLocation will calculate it
            },
            true // Mark as user GPS source
          );
          toast.success("Using your current location!");
        },
        (error) => {
          console.error("Error getting user location:", error);
          let message = "Could not get your location.";
          if (error.code === error.PERMISSION_DENIED) {
            message =
              "Location access denied. Please enable it in your browser settings.";
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            message = "Location information is unavailable.";
          } else if (error.code === error.TIMEOUT) {
            message = "The request to get user location timed out.";
          }
          toast.error(message);
          setUserCoordinates(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      toast.warning("Geolocation is not supported by this browser.");
      setUserCoordinates(null);
    }
  };
  return { requestUserLocation };
}
