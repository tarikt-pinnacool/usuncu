// hooks/useCurrentTime.ts
import { useEffect } from "react";
import { useAppStore } from "@/store/appStore";

/**
 * A hook that updates the current time in the Zustand store at a specified interval.
 * @param intervalMs The interval in milliseconds at which to update the time (default: 60000ms = 1 minute).
 */
export function useCurrentTime(intervalMs: number = 60000) {
  const setCurrentTime = useAppStore((state) => state.setCurrentTime);

  useEffect(() => {
    // Set the initial time immediately
    setCurrentTime(new Date());

    // Set up the interval to update the time
    const intervalId = setInterval(() => {
      setCurrentTime(new Date());
    }, intervalMs);

    // Clean up the interval when the component unmounts or the hook is re-run
    return () => clearInterval(intervalId);
  }, [setCurrentTime, intervalMs]); // Dependencies for the effect
}
