import { NextResponse } from "next/server";
import { DynamicScraper } from "@/lib/services/dynamic-scraper";

const scraper = new DynamicScraper();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    console.log(`Scraping website: ${url}`);
    const { articles } = await scraper.scrape(url);

    return NextResponse.json({ articles });
  } catch (error) {
    console.error("Scraping error:", error);
    const message = error instanceof Error ? error.message : "Scraping failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
