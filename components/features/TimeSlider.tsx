// components/features/TimeSlider.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/appStore";
import { format } from "date-fns";
import { PlayIcon, SunIcon } from "lucide-react";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useTranslation } from "@/context/i18nContext";

const TimeSlider = () => {
  const { t } = useTranslation();
  const {
    currentTime,
    isTimeManuallyControlled,
    setManualTime,
    switchToLiveTime,
  } = useAppStore();

  const hasMounted = useHasMounted();

  const SLIDER_MAX_VALUE = 24 * 4 - 1;

  const dateToSliderValue = (date: Date): number => {
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return Math.floor((hours * 60 + minutes) / 15);
  };

  const sliderValueToDate = (
    sliderValue: number,
    referenceDate: Date
  ): Date => {
    const totalMinutes = sliderValue * 15;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const newDate = new Date(referenceDate);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
  };

  // Local state for the slider to provide immediate feedback
  const [localSliderValue, setLocalSliderValue] = useState<number[]>([
    dateToSliderValue(currentTime),
  ]);

  // Effect to synchronize localSliderValue with global currentTime
  // when not manually controlling time (e.g., live updates or "Go Live" pressed)
  useEffect(() => {
    if (hasMounted && !isTimeManuallyControlled) {
      const newSliderValueFromGlobal = dateToSliderValue(currentTime);
      // Only update if local state is out of sync with global state
      if (localSliderValue[0] !== newSliderValueFromGlobal) {
        setLocalSliderValue([newSliderValueFromGlobal]);
      }
    }
    // We don't want localSliderValue in deps here, as this effect is about
    // global state dictating local state when not in manual mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, isTimeManuallyControlled, hasMounted]);

  const handleSliderChange = (value: number[]) => {
    // Update local state immediately for smooth dragging
    setLocalSliderValue(value);
    // Important: To make the map update *during* drag, we need to call setManualTime here.
    // This will set isTimeManuallyControlled to true.
    const newTime = sliderValueToDate(value[0], currentTime);
    setManualTime(newTime);
  };

  const handleSliderCommit = (value: number[]) => {
    return value;
    // This is called when the user releases the slider.
    // The setManualTime call in handleSliderChange already did the job.
    // We could potentially do a final definitive update here if needed,
    // but for now, handleSliderChange handles the store update.
    // If handleSliderChange did *not* call setManualTime, this would be the place.
    // console.log("Slider commit:", value);
  };

  const displayedTime = useMemo(() => {
    if (!hasMounted) {
      return "--:--";
    }
    // When manually controlling, the source of truth for display is localSliderValue transformed.
    // Otherwise, it's the global currentTime.
    // Since setManualTime updates currentTime, and isTimeManuallyControlled is true,
    // deriving displayedTime from currentTime should now be correct even during manual control.
    return format(currentTime, "HH:mm");
  }, [currentTime, hasMounted]); // Removed localSliderValue and isTimeManuallyControlled here as currentTime is the source

  if (!hasMounted) {
    return (
      <div className="flex flex-col items-center space-y-3 p-3 h-[76px] md:h-[56px] md:flex-row md:space-y-0 md:space-x-4 md:items-center">
        <div className="flex items-center space-x-2">
          <div className="w-28 h-9 bg-muted rounded-md animate-pulse"></div>
          <div className="text-sm font-medium bg-muted px-3 py-1.5 rounded-md w-[60px] h-9 animate-pulse"></div>
        </div>
        <div className="w-full md:w-64 h-5 bg-muted rounded-full animate-pulse mt-1 md:mt-0"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-3 p-3 bg-background rounded-lg shadow md:flex-row md:space-y-0 md:space-x-4 md:items-center">
      <div className="flex items-center space-x-2">
        <Button
          variant={isTimeManuallyControlled ? "outline" : "secondary"}
          size="sm"
          onClick={switchToLiveTime}
          title={t("timeSlider.buttonTitle")}
          className="w-28"
        >
          {isTimeManuallyControlled ? (
            <PlayIcon className="h-4 w-4 mr-1.5" />
          ) : (
            <SunIcon className="h-4 w-4 mr-1.5 animate-pulse text-orange-500" />
          )}
          {t("timeSlider.title")}
        </Button>
        <div className="text-sm font-medium tabular-nums bg-muted px-3 py-1.5 rounded-md w-[60px] text-center">
          {displayedTime}
        </div>
      </div>
      <Slider
        // The value prop should reflect the component's understanding of the current time.
        // If manual, localSliderValue is leading. If live, it's driven by currentTime.
        value={
          isTimeManuallyControlled
            ? localSliderValue
            : [dateToSliderValue(currentTime)]
        }
        onValueChange={handleSliderChange}
        onValueCommit={handleSliderCommit} // Can keep this for future use, e.g., debouncing
        max={SLIDER_MAX_VALUE}
        step={1}
        className="w-full md:w-64"
        aria-label="Time slider"
      />
    </div>
  );
};

export default TimeSlider;
