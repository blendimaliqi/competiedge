import { NextResponse } from "next/server";
import { dynamicScraper } from "@/lib/services/dynamic-scraper";
import { Article } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const { title, articles } = await dynamicScraper.scrape(url);

    return NextResponse.json({ title, articles });
  } catch (error) {
    console.error("Dynamic scraping error:", error);
    return NextResponse.json(
      { error: "Failed to scrape website" },
      { status: 500 }
    );
  }
}
