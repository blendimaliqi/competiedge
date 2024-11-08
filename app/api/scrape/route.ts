import { NextResponse } from "next/server";
import { dynamicScraper } from "@/lib/services/dynamic-scraper";
import { ScrapeResponse, ApiResponse } from "@/lib/types";
import { ScrapeRequestBody } from "@/lib/types/api";

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<ScrapeResponse>>> {
  try {
    const body: ScrapeRequestBody = await request.json();

    if (!body.url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    if (body.isInitialAdd) {
      const response: ScrapeResponse = {
        title: body.name || "",
        articleCount: 0,
        lastChecked: new Date(),
        url: body.url,
        data: JSON.stringify([]),
      };
      return NextResponse.json(response);
    }

    const { title, articles } = await dynamicScraper.scrape(body.url);

    const response: ScrapeResponse = {
      title,
      articleCount: articles.length,
      lastChecked: new Date(),
      url: body.url,
      data: JSON.stringify(articles),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Scraping error:", error);
    return NextResponse.json(
      { error: "Failed to scrape website" },
      { status: 500 }
    );
  }
}
