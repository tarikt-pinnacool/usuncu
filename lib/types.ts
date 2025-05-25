// lib/types.ts
import { Point, Polygon, LineString, MultiPolygon } from "geojson"; // Ensure these are imported

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  type: "node" | "way" | "relation";
  name?: string;
  tags: Record<string, string>;
  center: Coordinates;
  // A Place can be a point (node), a line (way), or a polygon (closed way/relation).
  // So, its geometry can be any of these.
  geometry?: Point | Polygon | LineString | null; // More permissive for Place
  isBuildingOutline?: boolean;
  relevantShadowPoint?: Coordinates;
  isInSun?: boolean | null;
}

export interface Building {
  id: string;
  // A Building's geometry should strictly be a Polygon or MultiPolygon.
  geometry: Polygon | MultiPolygon;
  height?: number;
}

export type BoundingBox = [number, number, number, number]; // S, W, N, E

export interface GeocodingResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: [string, string, string, string]; // string coords: minlat, maxlat, minlon, maxlon
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  icon?: string;
  // address object can be complex, define if needed
}
