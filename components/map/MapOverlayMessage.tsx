// components/map/MapOverlayMessage.tsx
import React from "react";
import { cn } from "@/lib/utils";

interface MapOverlayMessageProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  variant?: "info" | "warning" | "destructive" | "default";
  position?: "top-center" | "center" | "bottom-center";
  className?: string;
}

export const MapOverlayMessage: React.FC<MapOverlayMessageProps> = ({
  children,
  icon,
  variant = "default",
  position = "top-center",
  className,
}) => {
  const baseClasses =
    "absolute p-3 md:p-4 rounded-lg shadow-xl text-sm md:text-base z-1002 pointer-events-auto"; // Allow pointer events for potential close buttons later

  const variantClasses = {
    default: "bg-background/90 text-foreground border",
    info: "bg-sky-600/95 text-sky-foreground",
    warning: "bg-amber-500/95 text-amber-foreground",
    destructive: "bg-destructive/95 text-destructive-foreground",
  };

  const positionClasses = {
    "top-center": "top-4 left-1/2 -translate-x-1/2",
    center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
    "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
  };

  return (
    <div
      className={cn(
        baseClasses,
        variantClasses[variant],
        positionClasses[position],
        className
      )}
    >
      <div className="flex items-center">
        {icon && <div className="mr-3 flex-shrink-0">{icon}</div>}
        <div>{children}</div>
      </div>
    </div>
  );
};
