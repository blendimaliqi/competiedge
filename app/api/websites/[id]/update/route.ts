import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { dynamicScraper } from "@/lib/services/dynamic-scraper";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request, context: any) {
  try {
    const websiteId = context.params.id;
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");
    const authHeader = request.headers.get("authorization");
    const serviceRoleKey = authHeader?.replace("Bearer ", "");

    console.log("Update endpoint called:", {
      websiteId,
      hasSecret: !!secret,
      secretMatch: secret === CRON_SECRET,
      hasServiceRoleKey: !!serviceRoleKey,
    });

    if (!CRON_SECRET) {
      console.error("CRON_SECRET is not set in environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (secret !== CRON_SECRET) {
      console.error("Secret mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      !serviceRoleKey ||
      serviceRoleKey !== process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      console.error("Invalid service role key");
      return NextResponse.json(
        { error: "Unauthorized - Invalid service role key" },
        { status: 401 }
      );
    }

    // Use admin client for cron jobs
    const client = supabaseAdmin || supabase;

    // Get website URL for content analysis
    const { data: website } = await client
      .from("websites")
      .select("url, custom_content_patterns, custom_skip_patterns")
      .eq("id", websiteId)
      .single();

    if (!website?.url) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Get existing articles - remove time window to check against ALL articles
    const { data: existingArticles } = await client
      .from("articles")
      .select("url")
      .eq("website_id", websiteId);

    const existingUrls = new Set(
      existingArticles?.map((article) => article.url) || []
    );

    // Use dynamic scraper to get articles
    const { articles } = await dynamicScraper.scrape(website.url);

    // Find new articles by comparing with existing ones
    const newArticles = articles.filter(
      (article) => !existingUrls.has(article.url)
    );

    console.log("Found new articles:", newArticles.length);

    // Store new articles
    if (newArticles.length > 0) {
      const { error: articlesError } = await client.from("articles").insert(
        newArticles.map((article) => ({
          website_id: websiteId,
          title: article.title,
          url: article.url,
          path: article.path,
          summary: article.summary,
          published_date: article.date,
          first_seen: article.firstSeen,
        }))
      );

      if (articlesError) {
        console.error("Error inserting articles:", articlesError);
        return NextResponse.json(
          { error: "Failed to store articles" },
          { status: 500 }
        );
      }
    }

    // Update website last_checked timestamp and article count
    const { error: updateError } = await client
      .from("websites")
      .update({
        last_checked: new Date().toISOString(),
        article_count: (existingArticles?.length || 0) + newArticles.length,
      })
      .eq("id", websiteId);

    if (updateError) {
      console.error("Error updating website:", updateError);
      return NextResponse.json(
        { error: "Failed to update website" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: "Website updated successfully",
      newArticles: newArticles,
    });
  } catch (error) {
    console.error("Update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
