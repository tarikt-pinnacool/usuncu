// lib/types.ts
import { Point, Polygon, LineString } from "geojson";

export interface Coordinates {
  lat: number;
  lng: number;
}

export type BoundingBox = [number, number, number, number]; // [south, west, north, east]

export interface Place {
  id: string;
  type: "node" | "way" | "relation";
  name?: string;
  tags: Record<string, string>;
  center: Coordinates;
  geometry?: Point | Polygon | LineString | null;
  isBuildingOutline?: boolean;
  relevantShadowPoint?: Coordinates | null;
  isInSun?: boolean | null;
}

export interface Building {
  id: string;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
  tags: { [key: string]: string } | null;
  height: number | null; // In meters
  center: Coordinates;
}

export interface GeocodingResult {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  boundingbox: [string, string, string, string];
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
}
