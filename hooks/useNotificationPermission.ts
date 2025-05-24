// hooks/useNotificationPermission.ts
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";

type PermissionStatus = "default" | "granted" | "denied";

export function useNotificationPermission() {
  const [permission, setPermission] = useState<PermissionStatus>("default");

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission as PermissionStatus);
    } else {
      // Notifications not supported
      setPermission("denied"); // Treat as denied if not supported
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      toast.error("Browser notifications are not supported.");
      setPermission("denied");
      return false;
    }

    if (Notification.permission === "granted") {
      setPermission("granted");
      return true;
    }

    if (Notification.permission === "denied") {
      toast.info(
        "Notification permission was previously denied. Please enable it in your browser settings."
      );
      setPermission("denied");
      return false;
    }

    // 'default' state, so ask
    const result = await Notification.requestPermission();
    setPermission(result as PermissionStatus);
    if (result === "granted") {
      toast.success("Notification permission granted!");
      return true;
    } else {
      toast.error("Notification permission denied.");
      return false;
    }
  }, []);

  return { permission, requestPermission };
}
