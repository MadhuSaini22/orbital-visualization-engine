import { NextRequest, NextResponse } from "next/server";

const allowedProtocols = new Set(["http:", "https:"]);

export async function GET(request: NextRequest) {
  const sourceUrl = request.nextUrl.searchParams.get("url");

  if (!sourceUrl) {
    return NextResponse.json({ error: "Missing TLE endpoint URL." }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    return NextResponse.json({ error: "Please enter a valid http or https URL." }, { status: 400 });
  }

  if (!allowedProtocols.has(parsedUrl.protocol)) {
    return NextResponse.json({ error: "Only http and https TLE endpoints are allowed." }, { status: 400 });
  }

  try {
    const response = await fetch(parsedUrl, {
      cache: "no-store",
      headers: {
        Accept: "text/plain,*/*",
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `TLE endpoint responded with ${response.status}.` },
        { status: response.status },
      );
    }

    const tleText = await response.text();

    return new NextResponse(tleText, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/plain; charset=utf-8",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to fetch TLE data from that endpoint." },
      { status: 502 },
    );
  }
}
