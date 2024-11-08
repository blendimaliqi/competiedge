import { NextResponse } from "next/server";
import { dynamicScraper } from "@/lib/services/dynamic-scraper";
import { Article } from "@/lib/types";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    try {
      const { title, articles } = await dynamicScraper.scrape(url);
      return NextResponse.json({ title, articles });
    } catch (error) {
      console.error("Dynamic scraping error:", error);

      // Check if it's a Chrome executable error
      if (
        error instanceof Error &&
        error.message.includes("Failed to launch")
      ) {
        return NextResponse.json(
          {
            error: "Browser initialization failed",
            details:
              process.env.NODE_ENV === "development"
                ? error.message
                : undefined,
          },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { error: "Failed to scrape website" },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("API route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
