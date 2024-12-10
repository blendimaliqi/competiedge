import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { dynamicScraper } from "@/lib/services/dynamic-scraper";
import { monitoringService } from "@/lib/services/monitoring-service";
import { MonitoringRule } from "@/lib/types/monitoring";

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

    // Get website info including monitoring rules
    const { data: website, error: websiteError } = await client
      .from("websites")
      .select(
        `
        *,
        monitoring_rules (
          id,
          enabled,
          notify_email,
          type
        )
      `
      )
      .eq("id", websiteId)
      .single();

    if (websiteError) {
      console.error("Error fetching website:", websiteError);
      return NextResponse.json(
        { error: "Failed to fetch website data" },
        { status: 500 }
      );
    }

    if (!website?.url) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Get existing articles
    const { data: existingArticles, error: articlesError } = await client
      .from("articles")
      .select("url")
      .eq("website_id", websiteId);

    if (articlesError) {
      console.error("Error fetching existing articles:", articlesError);
      return NextResponse.json(
        { error: "Failed to fetch existing articles" },
        { status: 500 }
      );
    }

    const existingUrls = new Set(
      existingArticles?.map((article) => article.url) || []
    );

    console.log(`Found ${existingUrls.size} existing articles`);

    // Use dynamic scraper to get articles
    console.log(`Starting scrape of ${website.url}`);
    const { articles } = await dynamicScraper.scrape(website.url);
    console.log(`Scraping complete, found ${articles.length} total articles`);

    // Find new articles by comparing with existing ones
    const newArticles = articles.filter(
      (article) => !existingUrls.has(article.url)
    );
    console.log(`Found ${newArticles.length} new articles`);

    // Store new articles
    if (newArticles.length > 0) {
      const { error: insertError } = await client.from("articles").insert(
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

      if (insertError) {
        console.error("Error inserting articles:", insertError);
        return NextResponse.json(
          { error: "Failed to store articles" },
          { status: 500 }
        );
      }

      console.log(`Successfully stored ${newArticles.length} new articles`);

      // Send notifications for new articles
      const activeRules = (
        website.monitoring_rules as MonitoringRule[]
      )?.filter((rule) => rule.enabled && rule.type === "CONTENT_CHANGE");

      console.log(`Found ${activeRules?.length || 0} active monitoring rules`);

      if (activeRules?.length > 0) {
        for (const rule of activeRules) {
          try {
            // Format articles for notification
            const formattedLinks = newArticles.map((article) => {
              const url = new URL(article.url);
              // Remove tracking parameters
              url.search = "";
              url.hash = "";
              return url.toString();
            });

            console.log(
              `Sending notification to ${rule.notify_email} with ${formattedLinks.length} links`
            );

            await monitoringService.sendNotification(
              rule.notify_email,
              website.url,
              formattedLinks
            );

            // Update last triggered time for the rule
            const { error: updateRuleError } = await client
              .from("monitoring_rules")
              .update({ last_triggered: new Date().toISOString() })
              .eq("id", rule.id);

            if (updateRuleError) {
              console.error(
                "Error updating rule last_triggered:",
                updateRuleError
              );
            }
          } catch (error) {
            console.error("Error sending notification:", error);
          }
        }
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
      totalArticles: (existingArticles?.length || 0) + newArticles.length,
    });
  } catch (error) {
    console.error("Update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
