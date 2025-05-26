// hooks/useCurrentTime.ts
import { useEffect } from "react";
import { useAppStore } from "@/store/appStore";

export function useCurrentTime(intervalMs: number = 60000) {
  const setCurrentTime = useAppStore((state) => state.setCurrentTime);
  const isTimeManuallyControlled = useAppStore(
    (state) => state.isTimeManuallyControlled
  );

  useEffect(() => {
    // Set the initial time immediately ONLY if not manually controlled
    // Or, always set it, and let the manual control override if it happens later.
    // For now, let's let setCurrentTime in the store handle the logic.
    if (!isTimeManuallyControlled) {
      setCurrentTime(new Date()); // This will only update if not manual due to logic in setCurrentTime
    }

    // If time is manually controlled, don't start the interval.
    if (isTimeManuallyControlled) {
      return; // Exit early, no interval needed
    }

    const intervalId = setInterval(() => {
      // setCurrentTime will internally check isTimeManuallyControlled
      // so it won't update if the mode changed to manual after interval started.
      setCurrentTime(new Date());
    }, intervalMs);

    return () => clearInterval(intervalId);
  }, [setCurrentTime, intervalMs, isTimeManuallyControlled]); // Add isTimeManuallyControlled to dependencies
}
