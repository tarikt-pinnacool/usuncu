// lib/osm.ts
import { Position } from "geojson";
import { Place, Building, Coordinates } from "./types";
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

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  members?: any[];
  geometry?: any[];
}

// Simple coordinate equality check
function coordinatesEqual(coord1: Position, coord2: Position): boolean {
  // Add a small tolerance for floating point comparisons if necessary,
  // but for exact matches from OSM data, direct comparison is usually okay.
  return (
    coord1.length === coord2.length &&
    coord1[0] === coord2[0] &&
    coord1[1] === coord2[1]
  );
}

export function parseOverpassResponse(elements: OsmElement[]): {
  places: Place[];
  buildings: Building[];
} {
  const places: Place[] = [];
  const buildings: Building[] = [];
  // console.log(`OSM PARSER: Received ${elements.length} elements from Overpass.`);

  elements.forEach((el) => {
    const elId = `${el.type}/${el.id}`;
    const tags = el.tags || {};

    if (tags.amenity && POI_AMENITIES_PARSER.includes(tags.amenity)) {
      let center: Coordinates | undefined;
      let geometry: any; // Consider using specific GeoJSON types from 'geojson' package
      let isBuildingOutline = false;

      if (el.type === "node" && el.lat && el.lon) {
        center = { lat: el.lat, lng: el.lon };
        geometry = turf.point([el.lon, el.lat]).geometry;
      } else if (el.type === "way" && el.geometry) {
        const coordinates = el.geometry.map(
          (coord) => [coord.lon, coord.lat] as Position
        );
        if (
          coordinates.length >= 4 &&
          coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1])
        ) {
          geometry = turf.polygon([coordinates]).geometry; // [coordinates] for one ring
          try {
            const calculatedCentroid = turf.centroid(geometry); // geometry is Polygon here
            center = {
              lat: calculatedCentroid.geometry.coordinates[1],
              lng: calculatedCentroid.geometry.coordinates[0],
            };
          } catch (e) {
            console.warn(
              `Could not calculate center for way ${elId}, using first point. Error: ${e}`
            );
            if (coordinates[0])
              center = { lat: coordinates[0][1], lng: coordinates[0][0] };
          }
          if (tags.building) isBuildingOutline = true;
        } else if (coordinates.length > 0) {
          // A line
          center = { lat: coordinates[0][1], lng: coordinates[0][0] }; // Use first point for line
          geometry = turf.lineString(coordinates).geometry;
        }
      }

      if (center) {
        places.push({
          id: elId,
          type: el.type,
          name:
            tags.name || tags.amenity?.replace(/_/g, " ") || "Unnamed Place",
          tags: tags,
          center: center,
          geometry: geometry,
          isBuildingOutline: isBuildingOutline,
          isInSun: null,
        });
      }
    }

    if (tags.building) {
      let buildingGeometry: any; // Consider GeoJSON.Polygon | GeoJSON.MultiPolygon
      if (el.type === "way" && el.geometry) {
        const coordinates = el.geometry.map(
          (coord) => [coord.lon, coord.lat] as Position
        );
        if (
          coordinates.length >= 4 &&
          coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1])
        ) {
          buildingGeometry = turf.polygon([coordinates]).geometry;
        }
      } else if (
        el.type === "relation" &&
        tags.type === "multipolygon" &&
        el.members
      ) {
        const outerWaysCoordsList: Position[][] = [];
        el.members.forEach((member) => {
          if (
            member.type === "way" &&
            member.role === "outer" &&
            member.geometry
          ) {
            const wayCoords = member.geometry.map(
              (pt: any) => [pt.lon, pt.lat] as Position
            );
            if (
              wayCoords.length >= 4 &&
              coordinatesEqual(wayCoords[0], wayCoords[wayCoords.length - 1])
            ) {
              outerWaysCoordsList.push(wayCoords);
            }
          }
        });
        if (outerWaysCoordsList.length > 0 && outerWaysCoordsList[0]) {
          try {
            // For simplicity, creating a polygon from the first outer ring.
            // For true MultiPolygon, use turf.multiPolygon if structure demands.
            buildingGeometry = turf.polygon([outerWaysCoordsList[0]]).geometry;
          } catch (e) {
            console.warn(
              `Could not form polygon for relation ${elId} from its outer ways. Error: ${e}`
            );
          }
        }
      }

      if (buildingGeometry) {
        const levels = tags["building:levels"]
          ? parseInt(tags["building:levels"], 10)
          : null;
        const height = tags.height
          ? parseFloat(tags.height)
          : levels
          ? levels * 3.5
          : 10;
        buildings.push({
          id: elId,
          geometry: buildingGeometry,
          height: height,
        });
      }
    }
  });
  // console.log(`OSM PARSER: Parsed. Places: ${places.length}, Buildings: ${buildings.length}`);
  return { places, buildings };
}
