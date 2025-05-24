// lib/types.ts
export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Place {
  id: string; // OSM ID (e.g., "node/12345", "way/67890")
  type: "node" | "way" | "relation";
  name?: string;
  tags: Record<string, string>;
  center: Coordinates; // For ways/relations, this is a representative point
  geometry?: any; // GeoJSON.Polygon | GeoJSON.Point; - using 'any' for now
  isBuildingOutline?: boolean;
  relevantShadowPoint?: Coordinates;
  isInSun?: boolean | null; // null initially, then boolean
}

export interface Building {
  id: string;
  geometry: any; // GeoJSON.Polygon; - using 'any' for now
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
