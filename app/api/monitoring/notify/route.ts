import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { monitoringService } from "@/lib/services/monitoring-service";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  try {
    // Verify cron secret
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

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

    const { websiteId, newLinks } = await request.json();
    console.log("Received notification request:", { websiteId, newLinks });

    if (!websiteId || !newLinks) {
      console.error("Missing required fields:", { websiteId, newLinks });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get monitoring rules for this website
    const supabase = createRouteHandlerClient({ cookies });
    console.log("Fetching monitoring rules for website:", websiteId);
    const { data: rules } = await supabase
      .from("monitoring_rules")
      .select("*")
      .eq("website_id", websiteId)
      .eq("enabled", true)
      .eq("type", "CONTENT_CHANGE");

    console.log("Found monitoring rules:", rules);

    if (!rules || rules.length === 0) {
      console.log("No monitoring rules found for website:", websiteId);
      return NextResponse.json({ message: "No monitoring rules found" });
    }

    // Get the website URL for the email
    console.log("Fetching website details for:", websiteId);
    const { data: website } = await supabase
      .from("websites")
      .select("url")
      .eq("id", websiteId)
      .single();

    console.log("Found website:", website);

    if (!website) {
      console.error("Website not found:", websiteId);
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Process each rule
    for (const rule of rules) {
      try {
        console.log("Processing rule:", rule);
        console.log("Sending notification email to:", rule.notifyEmail);
        await monitoringService.sendNotification(
          rule.notifyEmail,
          website.url,
          newLinks
        );
        console.log("Notification sent successfully");

        console.log("Updating rule last_triggered timestamp");
        await supabase
          .from("monitoring_rules")
          .update({ last_triggered: new Date().toISOString() })
          .eq("id", rule.id);
        console.log("Rule updated successfully");
      } catch (error) {
        console.error(`Error processing rule ${rule.id}:`, error);
        // Continue with other rules even if one fails
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending notifications:", error);
    return NextResponse.json(
      { error: "Failed to send notifications" },
      { status: 500 }
    );
  }
}
