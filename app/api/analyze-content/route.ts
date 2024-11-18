import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import * as cheerio from "cheerio";
import axios from "axios";

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);

    // Extract key information
    const wordCount = $("body").text().split(/\s+/).length;
    const headings = $("h1, h2, h3")
      .map((_, el) => $(el).text())
      .get();
    const links = $("a[href]").length;
    const images = $("img").length;

    // Basic sentiment analysis
    const text = $("body").text().toLowerCase();
    const positiveWords = ["great", "innovative", "best", "leading"]; // Expand this
    const negativeWords = ["problem", "issue", "bad", "worst"]; // Expand this

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
    return NextResponse.json(
      { error: "Failed to analyze content" },
      { status: 500 }
    );
  }
}
