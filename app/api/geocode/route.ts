// app/api/geocode/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GeocodingResult } from "@/lib/types"; // Ensure this type matches

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json(
      { error: 'Missing query parameter "q"' },
      { status: 400 }
    );
  }

  const nominatimApiUrl = `${NOMINATIM_URL}?q=${encodeURIComponent(
    query
  )}&format=jsonv2&addressdetails=0&limit=5&accept-language=en`;

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

    return NextResponse.json(filteredData);
  } catch (error) {
    // Keep as implicit 'unknown' or type 'Error' if sure
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      "API Geocode Route: Error fetching/processing Nominatim data:",
      error
    );
    return NextResponse.json(
      {
        error: "Failed to fetch geocoding results from Nominatim",
        details: errorMessage,
      },
      { status: 500 }
    );
  }
}
