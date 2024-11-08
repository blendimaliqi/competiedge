import { NextResponse } from "next/server";
import { feedService } from "@/lib/services/feed-service";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const feedUrl = await feedService.detectFeed(url);
    return NextResponse.json({ feedUrl });
  } catch (error) {
    console.error("RSS detection error:", error);
    return NextResponse.json(
      { error: "Failed to detect RSS feed" },
      { status: 500 }
    );
  }
}
