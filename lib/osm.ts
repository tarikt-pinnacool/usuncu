// lib/osm.ts
import { Place, Building, Coordinates } from "./types";
// import {
// Position,
// Point as GeoJsonPoint,
// Polygon as GeoJsonPolygon,
// LineString as GeoJsonLineString,
// MultiPolygon as GeoJsonMultiPolygon, // Import MultiPolygon if you intend to create them
// } from "geojson";
import * as turf from "@turf/turf";

// This is used by parseOverpassResponse to identify relevant amenities.
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

// interface OsmMember {
//   type: "node" | "way" | "relation";
//   ref?: number;
//   role?: string;
//   geometry?: { lat: number; lon: number }[];
// }

// interface OsmElement {
//   type: "node" | "way" | "relation";
//   id: number;
//   lat?: number;
//   lon?: number;
//   tags?: Record<string, string>;
//   nodes?: number[];
//   members?: OsmMember[];
//   geometry?: { lat: number; lon: number }[]; // For ways/relations from 'out geom'
// }

// // Simple coordinate equality check
// function coordinatesEqual(coord1: Position, coord2: Position): boolean {
//   // Add a small tolerance for floating point comparisons if necessary,
//   // but for exact matches from OSM data, direct comparison is usually okay.
//   return (
//     coord1.length === coord2.length &&
//     coord1[0] === coord2[0] &&
//     coord1[1] === coord2[1]
//   );
// }

// Minimal OSM geometry type
interface OsmGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

// Minimal OSM element type for this file's usage
interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  members?: unknown[];
  geometry?: OsmGeometry;
}

// Helper to get coordinates from an Overpass element (primarily for node-based places)
function getCoordinates(element: OsmElement): Coordinates | null {
  if (element.lat && element.lon) {
    return { lat: element.lat, lng: element.lon };
  }
  return null;
}

// Helper to calculate centroid for polygon/multipolygon geometries
function getCentroid(geometry: OsmGeometry | undefined): Coordinates | null {
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
      return null; // Not a polygon or multipolygon type we can centroid
    }

    const centroid = turf.centroid(geoJsonGeometry);
    // Turf.js coordinates are [longitude, latitude]
    return {
      lat: centroid.geometry.coordinates[1],
      lng: centroid.geometry.coordinates[0],
    };
  } catch (e) {
    console.warn("Error calculating centroid for geometry:", geometry, e);
    return null;
  }
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

      // If it's a way or relation for an amenity, calculate centroid from geometry
      if (!placeCenter && element.geometry) {
        placeCenter = getCentroid(element.geometry);
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
      } else {
        // console.warn("Skipping place element with no discernible coordinates or centroid:", element);
      }
    }

    // Handle Buildings
    if (element.tags && element.tags.building) {
      // Only process elements that have a 'geometry' property with Polygon or MultiPolygon type.
      // Nodes tagged as 'building' are usually points and don't define a footprint for shadow casting.
      if (
        element.geometry &&
        (element.geometry.type === "Polygon" ||
          element.geometry.type === "MultiPolygon")
      ) {
        let buildingHeight: number | null = null;
        if (element.tags.height) {
          const heightValue = parseFloat(element.tags.height);
          if (!isNaN(heightValue)) {
            buildingHeight = heightValue;
          }
        } else if (element.tags["building:levels"]) {
          const levels = parseFloat(element.tags["building:levels"]);
          if (!isNaN(levels)) {
            buildingHeight = levels * 3; // Estimate 3m per level
          }
        }

        const buildingCenter = getCentroid(element.geometry);
        if (buildingCenter) {
          buildings.push({
            id: String(element.id),
            geometry: {
              type: element.geometry.type,
              coordinates: element.geometry.coordinates,
            },
            tags: element.tags,
            height: buildingHeight,
            center: buildingCenter, // <--- ASSIGN CALCULATED CENTER HERE
          });
        } else {
          console.warn(
            "Building with valid geometry but no valid centroid:",
            element
          );
        }
      } else {
        // console.log("Skipping building element without polygon/multipolygon geometry (e.g., node building):", element);
      }
    }
  });

  return { places, buildings };
}
