// app/api/geocode/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GeocodingResult } from "@/lib/types"; // Ensure this type matches

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function GET(request: NextRequest) {
  console.log("API Geocode Route HIT. Full URL:", request.url); // More specific log
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  console.log("API Geocode Route: Extracted 'q' parameter:", query);

  if (!query) {
    console.log("API Geocode Route: 'q' parameter is missing.");
    return NextResponse.json(
      { error: 'Missing query parameter "q"' },
      { status: 400 }
    );
  }

  const nominatimApiUrl = `${NOMINATIM_URL}?q=${encodeURIComponent(
    query
  )}&format=jsonv2&addressdetails=0&limit=5&accept-language=en`;
  console.log("API Geocode Route: Calling Nominatim URL:", nominatimApiUrl);

  try {
    const nominatimResponse = await fetch(nominatimApiUrl, {
      headers: {
        "User-Agent": "UsuncuApp/1.0 (contact@usuncu.ba)",
      },
    });

    if (!nominatimResponse.ok) {
      const errorText = await nominatimResponse.text();
      console.error(
        "API Geocode Route: Nominatim API error status:",
        nominatimResponse.status
      );
      console.error(
        "API Geocode Route: Nominatim API error response:",
        errorText
      );
      throw new Error(
        `Nominatim API request failed: ${nominatimResponse.status}`
      );
    }

    const data: GeocodingResult[] = await nominatimResponse.json();
    console.log("API Geocode Route: Nominatim response data (raw):", data);

    const filteredData = data
      .filter(
        (r) =>
          [
            "administrative",
            "city",
            "town",
            "village",
            "hamlet",
            "county",
            "state",
            "suburb",
          ].includes(r.type) ||
          (r.class === "boundary" && r.type === "administrative")
      )
      .slice(0, 5);
    console.log("API Geocode Route: Filtered data count:", filteredData.length);

    return NextResponse.json(filteredData);
  } catch (error: any) {
    console.error(
      "API Geocode Route: Error fetching/processing Nominatim data:",
      error
    );
    return NextResponse.json(
      {
        error: "Failed to fetch geocoding results from Nominatim",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
