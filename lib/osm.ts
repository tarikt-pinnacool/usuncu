// lib/osm.ts
import { Place, Building, Coordinates } from "./types";
import {
  Position,
  Point as GeoJsonPoint,
  Polygon as GeoJsonPolygon,
  LineString as GeoJsonLineString,
  MultiPolygon as GeoJsonMultiPolygon, // Import MultiPolygon if you intend to create them
} from "geojson";
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

interface OsmMember {
  type: "node" | "way" | "relation";
  ref?: number;
  role?: string;
  geometry?: { lat: number; lon: number }[];
}

interface OsmElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  nodes?: number[];
  members?: OsmMember[];
  geometry?: { lat: number; lon: number }[]; // For ways/relations from 'out geom'
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
  // (`OSM PARSER: Received ${elements.length} elements from Overpass.`);

  elements.forEach((el) => {
    const elId = `${el.type}/${el.id}`;
    const tags = el.tags || {};

    if (tags.amenity && POI_AMENITIES_PARSER.includes(tags.amenity)) {
      let center: Coordinates | undefined;
      // Use the correct union type for what a Place can be
      let placeSpecificGeometry:
        | GeoJsonPoint
        | GeoJsonPolygon
        | GeoJsonLineString
        | undefined;
      let isBuildingOutline = false;

      if (el.type === "node" && el.lat && el.lon) {
        center = { lat: el.lat, lng: el.lon };
        placeSpecificGeometry = turf.point([el.lon, el.lat])
          .geometry as GeoJsonPoint;
      } else if (el.type === "way" && el.geometry) {
        const coordinates = el.geometry.map(
          (coord) => [coord.lon, coord.lat] as Position
        );
        if (
          coordinates.length >= 4 &&
          coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1])
        ) {
          const polygonGeom = turf.polygon([coordinates]).geometry;
          placeSpecificGeometry = polygonGeom as GeoJsonPolygon;
          try {
            const calculatedCentroid = turf.centroid(polygonGeom);

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
        } else if (coordinates.length >= 2) {
          // A LineString needs at least 2 points
          center = { lat: coordinates[0][1], lng: coordinates[0][0] };
          placeSpecificGeometry = turf.lineString(coordinates)
            .geometry as GeoJsonLineString;
        } else if (coordinates.length > 0) {
          // A line
          center = { lat: coordinates[0][1], lng: coordinates[0][0] }; // Use first point for line
          placeSpecificGeometry = turf.lineString(coordinates).geometry;
        }
      }

      if (center && placeSpecificGeometry) {
        // Ensure geometry was successfully created
        places.push({
          id: elId,
          type: el.type,
          name:
            tags.name || tags.amenity?.replace(/_/g, " ") || "Unnamed Place",
          tags: tags,
          center: center,
          geometry: placeSpecificGeometry, // This now matches Place['geometry'] type
          isBuildingOutline: isBuildingOutline,
          isInSun: null,
        });
      }
    }

    if (tags.building) {
      // Building geometry must be Polygon or MultiPolygon
      let buildingShapelyGeometry:
        | GeoJsonPolygon
        | GeoJsonMultiPolygon
        | undefined;

      if (el.type === "way" && el.geometry) {
        const coordinates = el.geometry.map(
          (coord) => [coord.lon, coord.lat] as Position
        );
        if (
          coordinates.length >= 4 &&
          coordinatesEqual(coordinates[0], coordinates[coordinates.length - 1])
        ) {
          buildingShapelyGeometry = turf.polygon([coordinates])
            .geometry as GeoJsonPolygon;
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
              (pt: { lat: number; lon: number }) => [pt.lon, pt.lat] as Position
            );
            if (
              wayCoords.length >= 4 &&
              coordinatesEqual(wayCoords[0], wayCoords[wayCoords.length - 1])
            ) {
              outerWaysCoordsList.push(wayCoords);
            }
          }
        });
        if (outerWaysCoordsList.length > 0) {
          try {
            if (outerWaysCoordsList.length === 1) {
              buildingShapelyGeometry = turf.polygon(outerWaysCoordsList)
                .geometry as GeoJsonPolygon; // turf.polygon expects [[ring1], [ring2]]
            } else {
              // This is where you'd form a MultiPolygon
              // turf.multiPolygon expects coordinates in the form of [ [[[poly1Ring1]], [[poly1Ring2]]], [[[poly2Ring1]]] ]
              // For simplicity, if OSM "out geom" doesn't give us pre-formed multipolygons,
              // and we just have a list of outer rings, we might create separate Building entries
              // or attempt to construct a MultiPolygon if that's the true intent.
              // For now, let's assume the first valid outer way forms a polygon,
              // or if Overpass's `out geom` for relations already gives a multipolygon structure,
              // turf.multiPolygon might be directly applicable if el.geometry is shaped correctly.
              // This part is complex for full OSM multipolygon correctness.
              // A common output for `out geom` on multipolygon relations is actually a pre-assembled
              // GeoJSON MultiPolygon geometry in `el.geometry` if you use `out geom;` at the top level,
              // rather than having to assemble it from `el.members[n].geometry`.
              // If `el.geometry` for a relation *is* already a MultiPolygon, use it directly.
              if (
                el.geometry &&
                typeof (el.geometry as unknown as { type?: string }).type ===
                  "string" &&
                (el.geometry as unknown as { type: string }).type ===
                  "MultiPolygon"
              ) {
                buildingShapelyGeometry =
                  el.geometry as unknown as GeoJsonMultiPolygon;
              } else if (outerWaysCoordsList[0]) {
                buildingShapelyGeometry = turf.polygon([outerWaysCoordsList[0]])
                  .geometry as GeoJsonPolygon;
              }
            }
          } catch (e) {
            console.warn(
              `Could not form polygon for relation ${elId} from its outer ways. Error: ${e}`
            );
          }
        }
      }

      if (buildingShapelyGeometry) {
        // Check if we successfully got a Polygon or MultiPolygon
        const levels = tags["building:levels"]
          ? parseInt(tags["building:levels"], 10)
          : null;
        const heightStr = String(tags.height);
        const height = tags.height
          ? parseFloat(heightStr)
          : levels
          ? levels * 3.5
          : 10;
        buildings.push({
          id: elId,
          geometry: buildingShapelyGeometry, // This now matches Building['geometry']
          height: height,
        });
      }
    }
  });
  // (`OSM PARSER: Parsed. Places: ${places.length}, Buildings: ${buildings.length}`);
  return { places, buildings };
}
