import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabase, supabaseAdmin } from "@/lib/supabase";

const CRON_SECRET = process.env.CRON_SECRET;

// Helper function to check if a URL is likely an article
function isArticleUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname.toLowerCase();

    // Skip common non-article paths
    if (
      path === "/" ||
      path.includes("/tag/") ||
      path.includes("/category/") ||
      path.includes("/author/") ||
      path.includes("/search") ||
      path.includes("/login") ||
      path.includes("/signup") ||
      path.includes("/register") ||
      path.includes("/about") ||
      path.includes("/contact") ||
      path.includes("/privacy") ||
      path.includes("/terms") ||
      path.includes("/feed") ||
      path.includes("/rss") ||
      path.includes("/sitemap") ||
      path.includes("/wp-") ||
      path.includes("/page/") ||
      path.includes("/comment") ||
      path.includes("/trackback") ||
      path.includes("/cdn-cgi/") ||
      path.match(/\.(jpg|jpeg|png|gif|css|js|xml|txt)$/)
    ) {
      return false;
    }

    // Check for article indicators
    const articleIndicators = [
      "/article/",
      "/post/",
      "/story/",
      "/news/",
      "/blog/",
      "/read/",
      "/watch/",
      "/video/",
      "/p/",
      "/entry/",
    ];

    if (articleIndicators.some((indicator) => path.includes(indicator))) {
      return true;
    }

    // Check if path has a reasonable structure for an article
    // e.g., /2023/12/article-title or /section/article-title
    const segments = path.split("/").filter(Boolean);
    if (
      segments.length >= 2 &&
      segments[segments.length - 1].length > 10 &&
      !segments[segments.length - 1].includes("=")
    ) {
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}

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
      hasCronSecret: !!CRON_SECRET,
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

    // Update website last_checked timestamp
    const { data: updatedWebsite, error: updateError } = await client
      .from("websites")
      .update({ last_checked: new Date().toISOString() })
      .eq("id", websiteId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating website:", updateError);
      return NextResponse.json(
        { error: "Failed to update website" },
        { status: 500 }
      );
    }

    // Get website URL for content analysis
    const { data: website } = await client
      .from("websites")
      .select("url")
      .eq("id", websiteId)
      .single();

    if (!website?.url) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Get existing articles
    const { data: existingArticles } = await client
      .from("articles")
      .select("url")
      .eq("website_id", websiteId);

    const existingUrls = new Set(
      existingArticles?.map((article) => article.url) || []
    );

    // Analyze content
    const response = await fetch(
      process.env.NEXT_PUBLIC_APP_URL + "/api/analyze-content",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: website.url }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Content analysis failed:", {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
      });
      return NextResponse.json({
        website: updatedWebsite,
        message: "Update completed but analysis failed",
        error: errorText,
      });
    }

    const { metrics: currentMetrics } = await response.json();
    const currentLinks = (currentMetrics.links || []).filter(isArticleUrl);

    // Find new links by comparing with existing articles
    const newLinks = currentLinks.filter((link) => !existingUrls.has(link));
    console.log("Found new article links:", newLinks.length);

    // Store new articles
    if (newLinks.length > 0) {
      const { error: articlesError } = await client.from("articles").insert(
        newLinks.map((url) => ({
          website_id: websiteId,
          url,
          title: url, // You might want to fetch the actual title
          path: new URL(url).pathname,
          first_seen: new Date().toISOString(),
        }))
      );

      if (articlesError) {
        console.error("Error storing new articles:", articlesError);
        return NextResponse.json({
          website: updatedWebsite,
          message: "Update completed but failed to store new articles",
          error: articlesError.message,
        });
      }

      // Update article count
      const { error: countError } = await client
        .from("websites")
        .update({
          article_count: (existingArticles?.length || 0) + newLinks.length,
        })
        .eq("id", websiteId);

      if (countError) {
        console.error("Error updating article count:", countError);
      }
    }

    return NextResponse.json({
      website: updatedWebsite,
      message: "Update completed successfully",
      newLinks,
    });
  } catch (error) {
    console.error("Error in website update:", error);
    return NextResponse.json(
      { error: "Failed to update website" },
      { status: 500 }
    );
  }
}
