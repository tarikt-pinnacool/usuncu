import { Place, Building, Coordinates } from "./types";
import * as turf from "@turf/turf";
import { Position } from "geojson";

export const POI_AMENITIES_PARSER = [
  "restaurant",
  "cafe",
  "pub",
  "bar",
  "fast_food",
  "food_court",
  "ice_cream",
  "biergarten",
  "lounge",
  "cocktail_bar",
];

// Geometry structure directly from Overpass 'out geom;' for ways
interface OverpassWayGeometryItem {
  lat: number;
  lon: number;
}

// Expected GeoJSON-like geometry structure (can be part of Overpass output for relations, or our target structure)
interface ParsedGeoJsonGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  members?: unknown[];
  // 'geometry' can be an array of {lat,lon} for ways, or a GeoJSON-like object for relations/already processed.
  geometry?: OverpassWayGeometryItem[] | ParsedGeoJsonGeometry;
}

function getCoordinates(element: OsmElement): Coordinates | null {
  if (element.lat && element.lon) {
    return { lat: element.lat, lng: element.lon };
  }
  return null;
}

function getCentroid(
  geometry: ParsedGeoJsonGeometry | undefined
): Coordinates | null {
  if (!geometry || !geometry.type || !geometry.coordinates) return null;

  try {
    let geoJsonGeometry;
    if (geometry.type === "Polygon") {
      geoJsonGeometry = turf.polygon(geometry.coordinates as number[][][]);
    } else if (geometry.type === "MultiPolygon") {
      geoJsonGeometry = turf.multiPolygon(
        geometry.coordinates as number[][][][]
      );
    } else {
      return null;
    }
    const centroid = turf.centroid(geoJsonGeometry);
    return {
      lat: centroid.geometry.coordinates[1],
      lng: centroid.geometry.coordinates[0],
    };
  } catch (e) {
    console.warn("Error calculating centroid for geometry:", geometry, e);
    return null;
  }
}

function isOverpassWayGeometryItem(
  obj: unknown
): obj is OverpassWayGeometryItem {
  return !!obj && typeof obj === "object" && "lat" in obj && "lon" in obj;
}

export function parseOverpassResponse(data: { elements: OsmElement[] }): {
  places: Place[];
  buildings: Building[];
} {
  const places: Place[] = [];
  const buildings: Building[] = [];
  const elements = data.elements || [];

  elements.forEach((element: OsmElement) => {
    // Handle Places (amenities)
    if (element.tags && element.tags.amenity) {
      let placeCenter: Coordinates | null = getCoordinates(element);
      if (
        !placeCenter &&
        element.geometry &&
        typeof element.geometry === "object" &&
        "type" in element.geometry && // Check if it's ParsedGeoJsonGeometry
        "coordinates" in element.geometry
      ) {
        placeCenter = getCentroid(element.geometry as ParsedGeoJsonGeometry);
      }
      if (placeCenter) {
        places.push({
          id: String(element.id),
          type: element.type,
          name: element.tags.name,
          center: placeCenter,
          tags: element.tags,
          isInSun: null,
          relevantShadowPoint: null,
        });
      }
    }

    // Handle Buildings
    if (element.tags && element.tags.building) {
      let buildingGeoJsonGeometry: Building["geometry"] | null = null;

      if (element.geometry) {
        if (
          element.type === "way" &&
          Array.isArray(element.geometry) &&
          element.geometry.length > 0 &&
          isOverpassWayGeometryItem(element.geometry[0])
        ) {
          const wayGeometry = element.geometry as OverpassWayGeometryItem[];
          const coordinates: Position[] = wayGeometry.map((node) => [
            node.lon,
            node.lat,
          ]);

          if (coordinates.length >= 3) {
            // Ensure polygon is closed for GeoJSON spec
            const firstCoord = coordinates[0];
            const lastCoord = coordinates[coordinates.length - 1];
            if (
              firstCoord[0] !== lastCoord[0] ||
              firstCoord[1] !== lastCoord[1]
            ) {
              coordinates.push([...firstCoord]); // Close the polygon
            }

            if (coordinates.length >= 4) {
              // Valid closed polygon needs at least 4 points (3 unique + 1 closing)
              buildingGeoJsonGeometry = {
                type: "Polygon",
                coordinates: [coordinates], // GeoJSON Polygon: array of linear rings
              };
            } else {
              console.warn(
                `Building way ${element.id} has insufficient points (${
                  coordinates.length - 1
                } unique) for a Polygon after closing.`
              );
            }
          } else {
            console.warn(
              `Building way ${element.id} geometry from Overpass has insufficient points (${coordinates.length}) for a Polygon.`
            );
          }
        } else if (
          typeof element.geometry === "object" &&
          "type" in element.geometry &&
          "coordinates" in element.geometry
        ) {
          // Potentially already a GeoJSON geometry (e.g., for relations)
          const geom = element.geometry as ParsedGeoJsonGeometry;
          if (
            (geom.type === "Polygon" &&
              geom.coordinates &&
              (geom.coordinates as number[][][]).length > 0) ||
            (geom.type === "MultiPolygon" &&
              geom.coordinates &&
              (geom.coordinates as number[][][][]).length > 0)
          ) {
            buildingGeoJsonGeometry = geom as Building["geometry"];
          } else {
            console.warn(
              `Building ${element.id} (type ${element.type}) has geometry type ${geom.type} but invalid coordinates structure.`
            );
          }
        }
      }

      if (buildingGeoJsonGeometry) {
        let buildingHeight: number | null = null;
        if (element.tags.height) {
          const heightValue = parseFloat(element.tags.height);
          if (!isNaN(heightValue)) buildingHeight = heightValue;
        } else if (element.tags["building:levels"]) {
          const levels = parseFloat(element.tags["building:levels"]);
          if (!isNaN(levels)) buildingHeight = levels * 3;
        }

        const buildingCenter = getCentroid(buildingGeoJsonGeometry);
        if (buildingCenter) {
          buildings.push({
            id: String(element.id),
            geometry: buildingGeoJsonGeometry, // Use the processed GeoJSON geometry
            tags: element.tags,
            height: buildingHeight,
            center: buildingCenter,
          });
        } else {
          console.warn(
            `Building ${element.id} with valid geometry but failed to calculate centroid.`
          );
        }
      } else {
        // console.log(`Skipping building element ${element.id} (type ${element.type}) due to no processable geometry.`);
      }
    }
  });

  return { places, buildings };
}
