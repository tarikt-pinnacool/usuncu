// lib/shadow.ts
import * as turf from "@turf/turf";
import { Feature, Polygon, Point, Position } from "geojson";

import { Building, Coordinates, Place } from "./types";
import { SunPosition } from "@/hooks/useSunPosition";

const DEFAULT_BUILDING_HEIGHT = 10; // meters

// Helper type for Turf's units option
type TurfUnits =
  | "meters"
  | "miles"
  | "nauticalmiles"
  | "degrees"
  | "radians"
  | "inches"
  | "yards"
  | "metres"
  | "kilometers"
  | "kilometres";

export function calculateShadowPolygon(
  building: Building,
  sunPosition: SunPosition
): Feature<Polygon> | null {
  // Use turf.Feature and Polygon
  if (sunPosition.altitude <= 0) {
    return null;
  }

  const buildingHeight = building.height || DEFAULT_BUILDING_HEIGHT;
  const shadowLength = buildingHeight / Math.tan(sunPosition.altitude);

  if (shadowLength <= 0) return null;

  if (
    !building.geometry ||
    !building.geometry.coordinates ||
    !building.geometry.coordinates[0] ||
    building.geometry.coordinates[0].length < 3
  ) {
    console.warn(
      `Building ${building.id} has invalid geometry for shadow calculation.`
    );
    return null;
  }

  // Assuming building.geometry.coordinates[0] is Position[]
  const footprintVertices = building.geometry.coordinates[0] as Position[];

  const shadowPoints: Position[] = [];

  footprintVertices.forEach((vertexCoords: Position) => {
    const sunAzimuthDegrees = sunPosition.azimuth * (180 / Math.PI);
    const shadowBearing = (sunAzimuthDegrees + 180) % 360;

    const pointToProjectFrom = turf.point(vertexCoords);
    const unitsOption: { units: TurfUnits } = { units: "meters" }; // Explicitly type the options object
    const shadowVertex = turf.destination(
      pointToProjectFrom,
      shadowLength,
      shadowBearing,
      unitsOption
    );
    shadowPoints.push(shadowVertex.geometry.coordinates);
  });

  const allPointsForHull = footprintVertices.concat(shadowPoints);
  if (allPointsForHull.length < 3) return null;

  try {
    const pointFeatures = turf.featureCollection(
      allPointsForHull.map((p: Position) => turf.point(p))
    );
    const hull = turf.convex(pointFeatures);
    return hull; // hull is already turf.Feature<Polygon> | null
  } catch (e) {
    console.error("Error calculating convex hull for shadow:", e, building.id);
    return null;
  }
}

export function getRelevantShadowPointForPlace(
  place: Place,
  buildings: Building[]
): Coordinates {
  // Assuming place.geometry is a GeoJSON Geometry object compatible with Turf
  if (
    place.isBuildingOutline &&
    place.geometry &&
    place.geometry.type === "Polygon"
  ) {
    try {
      // turf.centroid works with Geometry or Feature
      const centroid = turf.centroid(place.geometry as Polygon); // Cast to Polygon for clarity
      return {
        lat: centroid.geometry.coordinates[1],
        lng: centroid.geometry.coordinates[0],
      };
    } catch (e) {
      console.warn(
        `Centroid calculation failed for place ${place.id}, using original center. Error: ${e}`
      );
      return place.center;
    }
  }

  if (place.geometry && place.geometry.type === "Point") {
    const placePointCoordinates = (place.geometry as Point).coordinates; // Get coordinates from Point geometry
    for (const building of buildings) {
      if (
        building.geometry &&
        building.geometry.type === "Polygon" &&
        building.geometry.coordinates &&
        building.geometry.coordinates[0] &&
        building.geometry.coordinates[0].length > 0
      ) {
        try {
          const buildingPolygon = building.geometry as Polygon; // Cast to Polygon

          if (
            turf.booleanPointInPolygon(placePointCoordinates, buildingPolygon)
          ) {
            // Create a LineString from the building's exterior ring
            const buildingExteriorRing = building.geometry
              .coordinates[0] as Position[];
            const buildingLineString = turf.lineString(buildingExteriorRing);
            const unitsOption: { units: TurfUnits } = { units: "meters" };

            const closestPointOnEdge = turf.nearestPointOnLine(
              buildingLineString,
              placePointCoordinates,
              unitsOption
            );
            return {
              lat: closestPointOnEdge.geometry.coordinates[1],
              lng: closestPointOnEdge.geometry.coordinates[0],
            };
          }
        } catch (e) {
          console.warn(
            `Error processing building ${building.id} for place ${place.id} shadow point: ${e}`
          );
        }
      }
    }
  }
  return place.center;
}

export function isLocationInSun(
  location: Coordinates,
  allCalculatedShadows: Feature<Polygon>[]
): boolean {
  const pointToCheckCoordinates: Position = [location.lng, location.lat];

  for (const shadowFeature of allCalculatedShadows) {
    if (shadowFeature && shadowFeature.geometry) {
      // shadowFeature.geometry is Polygon
      try {
        if (
          turf.booleanPointInPolygon(
            pointToCheckCoordinates,
            shadowFeature.geometry
          )
        ) {
          return false;
        }
      } catch (e) {
        console.warn("Error in booleanPointInPolygon check:", e);
      }
    }
  }
  return true;
}
