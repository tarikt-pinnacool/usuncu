// app/api/osm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { parseOverpassResponse } from "@/lib/osm";

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const bbox = searchParams.get("bbox");
  const amenityType =
    searchParams.get("amenityType") ||
    "cafe|restaurant|bar|pub|lounge|cocktail_bar";

  if (!bbox) {
    return NextResponse.json(
      { error: "Bounding box (bbox) parameter is required." },
      { status: 400 }
    );
  }

  // Overpass query for amenities and buildings within the bbox
  const overpassQuery = `
    [out:json][timeout:60];
    (
      node["amenity"~"${amenityType}"](${bbox});
      way["amenity"~"${amenityType}"](${bbox});
      relation["amenity"~"${amenityType}"](${bbox});
      // Query for buildings within the bbox
      way["building"](${bbox}); // Only ways and relations for buildings
      relation["building"](${bbox}); // Nodes with "building" tag rarely define a footprint for shadows
    );
    out body geom; // <--- CHANGED: Used 'out body geom;' to get full geometry
    // removed '>;' as it's not needed with 'out geom;'
    // removed 'out skel qt;' as it provides minimal data and is incompatible with 'out geom;'
  `;

  try {
    const response = await fetch(OVERPASS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Overpass API error:", response.status, errorText);
      return NextResponse.json(
        {
          error: "Failed to fetch data from Overpass API",
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    const { places, buildings } = parseOverpassResponse(data);

    return NextResponse.json({ places, buildings });
  } catch (error) {
    console.error("Error in OSM API route:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
