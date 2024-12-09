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

    const maxRetries = 3;
    const retryDelay = 1000;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(
            `Retry attempt ${attempt}/${maxRetries} after ${retryDelay}ms`
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }

        const response = await axios.get(url, {
          timeout: 30000, // Increased timeout to 30 seconds
          maxRedirects: 5,
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept:
              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Sec-Ch-Ua":
              '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
            Referer: new URL(url).origin,
          },
          validateStatus: function (status) {
            return status < 500; // Accept all status codes less than 500
          },
        });

        if (!response.data) {
          throw new Error("No content received from URL");
        }

        if (response.status === 403 || response.status === 429) {
          throw new Error(`Request blocked with status ${response.status}`);
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
        console.error(`Attempt ${attempt} failed:`, error);
        lastError = error;

        // If this was the last attempt, or if it's not a retryable error, throw
        if (
          attempt === maxRetries ||
          !(
            axios.isAxiosError(error) &&
            (error.response?.status === 403 ||
              error.response?.status === 429 ||
              error.code === "ECONNABORTED")
          )
        ) {
          break;
        }
      }
    }

    // If we got here, all retries failed
    console.error("All retry attempts failed");

    if (axios.isAxiosError(lastError)) {
      console.error("Axios error details:", {
        code: lastError.code,
        status: lastError.response?.status,
        statusText: lastError.response?.statusText,
        headers: lastError.response?.headers,
      });

      if (lastError.code === "ECONNABORTED") {
        return NextResponse.json({ error: "Request timeout" }, { status: 408 });
      }
      if (lastError.response?.status === 404) {
        return NextResponse.json({ error: "Page not found" }, { status: 404 });
      }
      if (lastError.response?.status === 403) {
        return NextResponse.json(
          {
            error:
              "Access forbidden - website might be blocking automated requests",
          },
          { status: 403 }
        );
      }
      if (lastError.response?.status === 429) {
        return NextResponse.json(
          { error: "Too many requests - rate limited by website" },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      {
        error: "Failed to analyze content",
        details:
          lastError instanceof Error ? lastError.message : String(lastError),
      },
      { status: 500 }
    );
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
