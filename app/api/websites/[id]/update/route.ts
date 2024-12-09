import { NextResponse } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request, context: any) {
  try {
    const websiteId = context.params.id;
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    // Use admin client for cron jobs
    const client =
      secret === CRON_SECRET ? supabaseAdmin || supabase : supabase;

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
    const currentLinks = currentMetrics.links || [];

    // Find new links by comparing with existing articles
    const newLinks = currentLinks.filter(
      (link: string) => !existingUrls.has(link)
    );
    console.log("Found new links:", newLinks.length);

    // Store new articles
    if (newLinks.length > 0) {
      const { error: insertError } = await client.from("articles").insert(
        newLinks.map((url: string) => ({
          website_id: websiteId,
          url,
          title: url, // You might want to fetch the actual title
          path: new URL(url).pathname,
          first_seen: new Date().toISOString(),
        }))
      );

      if (insertError) {
        console.error("Error storing new articles:", insertError);
        return NextResponse.json({
          website: updatedWebsite,
          message: "Update completed but failed to store new articles",
          error: insertError.message,
        });
      }

      // Update article count
      const { error: countError } = await client
        .from("websites")
        .update({ article_count: existingUrls.size + newLinks.length })
        .eq("id", websiteId);

      if (countError) {
        console.error("Error updating article count:", countError);
      }

      // If this is a cron job request and we found new links, send notifications
      if (secret === CRON_SECRET) {
        try {
          const notifyResponse = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL}/api/monitoring/notify?secret=${CRON_SECRET}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                websiteId,
                newLinks,
              }),
            }
          );

          if (!notifyResponse.ok) {
            console.error(
              "Failed to send notifications:",
              await notifyResponse.text()
            );
          }
        } catch (error) {
          console.error("Error sending notifications:", error);
        }
      }
    }

    return NextResponse.json({
      website: updatedWebsite,
      message: "Update completed successfully",
      newLinks: newLinks.length > 0 ? newLinks : undefined,
    });
  } catch (error) {
    console.error("Error updating website:", error);
    return NextResponse.json(
      {
        error: "Failed to update website",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
