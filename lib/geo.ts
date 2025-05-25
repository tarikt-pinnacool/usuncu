// lib/geo.ts
import * as turf from "@turf/turf";
import { BoundingBox, Coordinates } from "./types";
import { Feature, Polygon, MultiPolygon } from "geojson";

/**
 * Converts a BoundingBox array [s,w,n,e] to a GeoJSON Polygon Feature.
 * Turf.js expects coordinates as [longitude, latitude].
 */
export function bboxToPolygon(bbox: BoundingBox): Feature<Polygon> {
  const [s, w, n, e] = bbox;
  return turf.polygon([
    [
      [w, s], // Southwest
      [e, s], // Southeast
      [e, n], // Northeast
      [w, n], // Northwest
      [w, s], // Close the polygon
    ],
  ]);
}

/**
 * Checks if a given coordinate is within a bounding box.
 */
export function isCoordinateInBbox(
  coord: Coordinates,
  bbox: BoundingBox
): boolean {
  const [s, w, n, e] = bbox;
  return coord.lat >= s && coord.lat <= n && coord.lng >= w && coord.lng <= e;
}

/**
 * Calculates the area(s) within the `currentViewport` that have NOT been covered by `alreadyFetchedAreas`.
 * `alreadyFetchedAreas` should be an array of BoundingBox.
 * Returns an array of GeoJSON Polygon Features representing the unfetched portions.
 * If the current viewport is entirely covered, returns an empty array.
 */
export function getUnfetchedAreas(
  currentViewport: BoundingBox,
  alreadyFetchedAreas: BoundingBox[]
): Feature<Polygon>[] {
  let viewportPoly: Feature<Polygon | MultiPolygon> =
    bboxToPolygon(currentViewport);

  for (const fetchedBbox of alreadyFetchedAreas) {
    const fetchedPoly = bboxToPolygon(fetchedBbox);
    try {
      const diff = turf.difference(
        turf.featureCollection([viewportPoly, fetchedPoly])
      );
      if (diff) {
        viewportPoly = diff as Feature<Polygon | MultiPolygon>;
      } else {
        return []; // Current viewportPoly is entirely covered
      }
    } catch (error) {
      console.warn(
        "Error calculating difference (likely geometry issue or empty polygon):",
        error
      );
    }
  }

  if (viewportPoly.geometry.type === "Polygon") {
    return [viewportPoly as Feature<Polygon>];
  } else if (viewportPoly.geometry.type === "MultiPolygon") {
    // --- FIX FOR 'Expected 1 arguments, but got 2.' ---
    // Change `coords` to `polygonCoords` to avoid ambiguity with `Array.prototype.map`'s `index` argument.
    return (viewportPoly as Feature<MultiPolygon>).geometry.coordinates.map(
      (polygonCoords) => turf.polygon(polygonCoords) as Feature<Polygon>
    );
    // --- END FIX ---
  } else {
    return [];
  }
}
