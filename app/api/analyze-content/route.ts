import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import * as cheerio from "cheerio";
import axios from "axios";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    console.log("Analyzing content for URL:", url);

    if (!url) {
      console.error("No URL provided");
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      console.error("Invalid URL format:", url);
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    console.log("Making request to URL:", url);
    const response = await axios.get(url, {
      timeout: 30000, // Increased timeout to 30 seconds
      maxRedirects: 5,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.data) {
      console.error("No content received from URL:", url);
      return NextResponse.json(
        { error: "No content received from URL" },
        { status: 404 }
      );
    }

    console.log("Successfully fetched content, parsing with cheerio");
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
    console.error("Content analysis error:", {
      url: request.url,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (axios.isAxiosError(error)) {
      console.error("Axios error details:", {
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        headers: error.response?.headers,
      });

      if (error.code === "ECONNABORTED") {
        return NextResponse.json({ error: "Request timeout" }, { status: 408 });
      }
      if (error.response?.status === 404) {
        return NextResponse.json({ error: "Page not found" }, { status: 404 });
      }
      if (error.response?.status === 403) {
        return NextResponse.json(
          {
            error:
              "Access forbidden - website might be blocking automated requests",
          },
          { status: 403 }
        );
      }
      if (error.response?.status === 429) {
        return NextResponse.json(
          { error: "Too many requests - rate limited by website" },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to analyze content",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
