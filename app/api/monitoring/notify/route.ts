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

    if (!websiteId || !newLinks) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Get the website details
    const supabase = createRouteHandlerClient({ cookies });
    const { data: website } = await supabase
      .from("websites")
      .select("url")
      .eq("id", websiteId)
      .single();

    if (!website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Get monitoring rules for this website
    const { data: rules } = await supabase
      .from("monitoring_rules")
      .select("*")
      .eq("website_id", websiteId)
      .eq("enabled", true)
      .eq("type", "CONTENT_CHANGE");

    if (!rules || rules.length === 0) {
      return NextResponse.json({ message: "No monitoring rules found" });
    }

    // Send notifications for each rule
    for (const rule of rules) {
      await monitoringService.sendEmail(
        rule.notify_email,
        `${newLinks.length} New Link${newLinks.length === 1 ? "" : "s"} Found`,
        `New links found on ${website.url}:\n\n${newLinks
          .map((link: string) => `- ${link}`)
          .join("\n")}`
      );

      // Update last triggered timestamp
      await supabase
        .from("monitoring_rules")
        .update({ last_triggered: new Date().toISOString() })
        .eq("id", rule.id);
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
