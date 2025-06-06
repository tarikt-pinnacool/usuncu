import * as turf from "@turf/turf";
import { Feature, Polygon, Position } from "geojson";
import { Building, Coordinates, Place } from "./types";
import { SunPosition } from "@/hooks/useSunPosition";

const DEFAULT_BUILDING_HEIGHT = 10; // meters
export const MIN_SUN_ALTITUDE_RAD = 0.01; // Approx 0.57 degrees

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
  if (!building || !building.geometry) {
    console.warn(
      "calculateShadowPolygon: Building or building.geometry is undefined."
    );
    return null;
  }
  if (sunPosition.altitude <= MIN_SUN_ALTITUDE_RAD) {
    return null;
  }

  const buildingHeight = building.height || DEFAULT_BUILDING_HEIGHT;
  if (buildingHeight <= 0) {
    return null;
  }

  const tanAltitude = Math.tan(sunPosition.altitude);
  if (tanAltitude <= 0) return null; // Should be covered by altitude check, but good for safety
  const shadowLength = buildingHeight / tanAltitude;

  if (shadowLength <= 0.01) {
    // Shadow too small
    return null;
  }

  let footprintVertices: Position[];
  if (building.geometry.type === "Polygon") {
    if (
      !building.geometry.coordinates ||
      !building.geometry.coordinates[0] ||
      building.geometry.coordinates[0].length < 4 // A valid polygon ring needs at least 3 unique points + closing point
    ) {
      console.warn(
        `Building ${building.id} (Polygon) has invalid coordinates for shadow calculation. Needs at least 4 points in outer ring. Got:`,
        building.geometry.coordinates[0]?.length
      );
      return null;
    }
    footprintVertices = building.geometry.coordinates[0] as Position[];
  } else if (building.geometry.type === "MultiPolygon") {
    if (
      !building.geometry.coordinates ||
      !building.geometry.coordinates[0] ||
      !building.geometry.coordinates[0][0] ||
      building.geometry.coordinates[0][0].length < 4
    ) {
      console.warn(
        `Building ${building.id} (MultiPolygon) has invalid coordinates for shadow calculation. Needs at least 4 points in first polygon's outer ring. Got:`,
        building.geometry.coordinates[0]?.[0]?.length
      );
      return null;
    }
    footprintVertices = building.geometry.coordinates[0][0] as Position[]; // Use outer ring of the first polygon
  } else {
    console.warn(
      `Building ${building.id} has unhandled geometry type: ${building.geometry.type}`
    );
    return null;
  }

  // Validate vertices
  if (
    footprintVertices.some(
      (v) =>
        !Array.isArray(v) ||
        v.length < 2 ||
        typeof v[0] !== "number" ||
        typeof v[1] !== "number"
    )
  ) {
    console.warn(
      `Building ${building.id} has malformed footprint vertices after selection.`,
      footprintVertices.slice(0, 3)
    );
    return null;
  }

  const shadowPoints: Position[] = [];
  footprintVertices.forEach((vertexCoords: Position) => {
    const sunAzimuthDegreesFromNorth =
      (sunPosition.azimuth * (180 / Math.PI) + 180) % 360;
    const shadowBearing = (sunAzimuthDegreesFromNorth + 180) % 360;

    const pointToProjectFrom = turf.point(vertexCoords);
    const unitsOption: { units: TurfUnits } = { units: "meters" };
    try {
      const shadowVertex = turf.destination(
        pointToProjectFrom,
        shadowLength,
        shadowBearing,
        unitsOption
      );
      shadowPoints.push(shadowVertex.geometry.coordinates);
    } catch (e) {
      console.error(
        "Error in turf.destination for building",
        building.id,
        "vertex:",
        vertexCoords,
        e
      );
    }
  });

  if (
    shadowPoints.length !== footprintVertices.length ||
    shadowPoints.length === 0
  ) {
    console.warn(
      `Building ${building.id}: Not all shadow points could be calculated. Footprint vertices: ${footprintVertices.length}, Shadow points: ${shadowPoints.length}`
    );
    return null;
  }

  const allPointsForHull = footprintVertices.concat(shadowPoints);
  const validPointsForHull = allPointsForHull.filter(
    (p) =>
      Array.isArray(p) &&
      p.length >= 2 &&
      typeof p[0] === "number" &&
      typeof p[1] === "number"
  );

  if (validPointsForHull.length < 3) {
    console.warn(
      `Building ${building.id}: Not enough valid points (${validPointsForHull.length}) for convex hull.`
    );
    return null;
  }

  try {
    const validPointFeatures = turf.featureCollection(
      validPointsForHull.map((p) => turf.point(p))
    );
    const hull = turf.convex(validPointFeatures);

    if (hull && hull.geometry && hull.geometry.type === "Polygon") {
      return hull;
    } else {
      // console.warn(`Convex hull for building ${building.id} was not a Polygon or was null. Type: ${hull?.geometry?.type}. Input points: ${validPointsForHull.length}`);
      return null;
    }
  } catch (e) {
    console.error(
      "Error calculating convex hull for shadow:",
      e,
      "Building ID:",
      building.id
    );
    return null;
  }
}

// isLocationInSun - minor refinement for potentially null location
export function isLocationInSun(
  location: Coordinates | null, // Allow null
  allCalculatedShadows: Feature<Polygon>[]
): boolean {
  if (!location) {
    // console.warn("isLocationInSun: location is null, returning true (in sun) as default.");
    return true; // Or false, or null, depending on desired behavior for unknown points
  }

  const pointToCheckCoordinates: Position = [location.lng, location.lat];

  if (allCalculatedShadows.length === 0) {
    return true; // No shadows, so it's in the sun
  }

  for (const shadowFeature of allCalculatedShadows) {
    if (
      shadowFeature &&
      shadowFeature.geometry &&
      shadowFeature.geometry.type === "Polygon" &&
      shadowFeature.geometry.coordinates
    ) {
      try {
        if (
          turf.booleanPointInPolygon(
            pointToCheckCoordinates,
            shadowFeature.geometry
          )
        ) {
          return false; // Point is inside a shadow polygon
        }
      } catch (e) {
        console.warn(
          "isLocationInSun: Error in booleanPointInPolygon check:",
          e,
          "Point:",
          pointToCheckCoordinates,
          "Shadow Feature ID (if any):",
          shadowFeature.id
        );
      }
    }
  }
  return true; // Point is not in any of the shadow polygons
}

export function getRelevantShadowPointForPlace(
  place: Place,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildings: Building[] // buildings param currently not effectively used for Point amenities in a simple way
): Coordinates {
  // If the place itself is defined as a building outline (e.g., a large restaurant that is its own building)
  // and has a polygon geometry, use its centroid.
  if (
    place.isBuildingOutline && // This flag would need to be set during OSM parsing if a place IS a building
    place.geometry &&
    place.geometry.type === "Polygon" &&
    place.geometry.coordinates &&
    place.geometry.coordinates.length > 0
  ) {
    try {
      const placePolygon = turf.polygon(
        place.geometry.coordinates as Position[][]
      );
      const centroid = turf.centroid(placePolygon);
      return {
        lat: centroid.geometry.coordinates[1],
        lng: centroid.geometry.coordinates[0],
      };
    } catch (e) {
      console.warn(
        `Centroid calculation failed for place polygon ${place.id}, using original center. Error: ${e}`
      );
      return place.center; // Fallback to place.center from OSM node/way center
    }
  }

  // For all other cases (most point amenities like cafes, bars not explicitly mapped as their own building outline),
  // simply use their defined center point.
  // The previous logic for checking if a point is inside another building and finding nearest edge
  // can be complex and might not always yield the desired "seating area" point.
  // Relying on the accuracy of building shadows around the place.center is often a more robust starting point.
  return place.center;
}
