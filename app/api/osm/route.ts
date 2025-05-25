// app/api/osm/route.ts
import { NextRequest, NextResponse } from "next/server";
// Import the exported parseOverpassResponse from lib/osm.ts
import { parseOverpassResponse } from "@/lib/osm";
// BoundingBox type might be useful for validation if you add it
// import { BoundingBox } from '@/lib/types';

const OVERPASS_API_URL_ROUTE = "https://overpass-api.de/api/interpreter";
// POI_AMENITIES_PARSER is exported from lib/osm.ts, or define locally for API route
// For simplicity, let's define it locally if lib/osm.ts is becoming purely a parser
const POI_AMENITIES_API = [
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

// This function builds the Overpass query using a bbox string
function buildOverpassQueryFromBbox(bboxStr: string): string {
  const amenityFilter = POI_AMENITIES_API.join("|");
  const poiQueries = `
    node["amenity"~"^(${amenityFilter})$"](${bboxStr});
    way["amenity"~"^(${amenityFilter})$"](${bboxStr});
  `;
  const buildingQuery = `
    way["building"](${bboxStr});
    relation["building"]["type"="multipolygon"](${bboxStr});
  `;
  return `
    [out:json][timeout:90];
    (
      ${poiQueries}
      ${buildingQuery}
    );
    out geom;
  `;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const bboxStr = searchParams.get("bbox"); // Expecting bbox as "S,W,N,E"

  if (!bboxStr) {
    return NextResponse.json(
      { error: "Missing bbox parameter (expected S,W,N,E)" },
      { status: 400 }
    );
  }

  const bboxParts = bboxStr.split(",").map(parseFloat);
  if (bboxParts.length !== 4 || bboxParts.some(isNaN)) {
    return NextResponse.json(
      { error: "Invalid bbox format. Expected 4 comma-separated numbers." },
      { status: 400 }
    );
  }

  const query = buildOverpassQueryFromBbox(bboxStr);

  try {
    const overpassResponse = await fetch(OVERPASS_API_URL_ROUTE, {
      method: "POST",
      body: query,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "UsuncuApp/1.0 (contact@usuncu.ba)", // Your App's User-Agent
      },
    });

    if (!overpassResponse.ok) {
      const errorText = await overpassResponse.text();
      console.error(
        "Overpass API error (from API route):",
        overpassResponse.status,
        errorText
      );
      // Return more of the error text if helpful
      throw new Error(
        `Overpass API request failed: ${
          overpassResponse.status
        } - ${errorText.substring(0, 300)}`
      );
    }

    const data = await overpassResponse.json();
    const { places, buildings } = parseOverpassResponse(data.elements || []);

    return NextResponse.json({ places, buildings });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error in /api/osm for bbox ${bboxStr}:`, error);
    return NextResponse.json(
      {
        error: "Failed to fetch or process data from Overpass API",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
