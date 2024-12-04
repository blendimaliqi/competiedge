import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import * as cheerio from "cheerio";
import axios from "axios";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const response = await axios.get(url, {
      timeout: 10000, // 10 second timeout
      maxRedirects: 5,
      headers: {
        "User-Agent": "CompetieEdge Monitor/1.0",
      },
    });

    if (!response.data) {
      return NextResponse.json(
        { error: "No content received from URL" },
        { status: 404 }
      );
    }

    const $ = cheerio.load(response.data);

    // Extract key information
    const wordCount = $("body")
      .text()
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    const headings = $("h1, h2, h3")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter((heading) => heading.length > 0);

    // Extract actual links instead of just counting them
    const links = $("a[href]")
      .map((_, el) => {
        const href = $(el).attr("href");
        if (!href || href === "#" || href.startsWith("javascript:"))
          return null;
        try {
          // Convert relative URLs to absolute
          const absoluteUrl = new URL(href, url).href;
          return absoluteUrl;
        } catch (e) {
          return null;
        }
      })
      .get()
      .filter(Boolean);

    const images = $("img").length;

    // Basic sentiment analysis
    const text = $("body").text().toLowerCase();
    const positiveWords = [
      "great",
      "innovative",
      "best",
      "leading",
      "success",
      "excellent",
      "amazing",
    ];
    const negativeWords = [
      "problem",
      "issue",
      "bad",
      "worst",
      "failure",
      "poor",
      "terrible",
    ];

    const sentiment = {
      positive: positiveWords.filter((word) => text.includes(word)).length,
      negative: negativeWords.filter((word) => text.includes(word)).length,
    };

    return NextResponse.json({
      metrics: {
        wordCount,
        headings,
        links,
        images,
        sentiment,
      },
    });
  } catch (error) {
    console.error("Content analysis error:", error);

    if (axios.isAxiosError(error)) {
      if (error.code === "ECONNABORTED") {
        return NextResponse.json({ error: "Request timeout" }, { status: 408 });
      }
      if (error.response?.status === 404) {
        return NextResponse.json({ error: "Page not found" }, { status: 404 });
      }
      if (error.response?.status === 403) {
        return NextResponse.json(
          { error: "Access forbidden" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to analyze content" },
      { status: 500 }
    );
  }
}
