import { NextResponse } from "next/server";
import { feedService } from "@/lib/services/feed-service";
import axios from "axios";

export async function POST(request: Request) {
  try {
    const { feedUrl } = await request.json();

    if (!feedUrl) {
      return NextResponse.json(
        { error: "Feed URL is required" },
        { status: 400 }
      );
    }

    // Ensure we have an absolute URL
    const baseUrl = new URL(feedUrl).origin;
    const absoluteFeedUrl = feedUrl.startsWith("/")
      ? `${baseUrl}${feedUrl}`
      : feedUrl;

    // Make the request server-side
    const response = await axios.get(absoluteFeedUrl, {
      headers: {
        Accept:
          "application/rss+xml, application/xml, text/xml, application/atom+xml",
        "User-Agent": "Mozilla/5.0 (compatible; RSS Reader Bot/1.0)",
      },
    });

    const articles = await feedService.getFeedArticles(response.data);
    return NextResponse.json({ articles });
  } catch (error) {
    console.error("RSS articles fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch RSS articles" },
      { status: 500 }
    );
  }
}
