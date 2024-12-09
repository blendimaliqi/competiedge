import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { monitoringService } from "@/lib/services/monitoring-service";
import { supabase, supabaseAdmin } from "@/lib/supabase";

const CRON_SECRET = process.env.CRON_SECRET;

export async function POST(request: Request) {
  try {
    // Verify cron secret
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    console.log("Notify endpoint called:", {
      hasSecret: !!secret,
      hasCronSecret: !!CRON_SECRET,
      secretMatch: secret === CRON_SECRET,
    });

    if (!CRON_SECRET) {
      console.error("CRON_SECRET is not set in environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (secret !== CRON_SECRET) {
      console.error("Secret mismatch:", {
        providedSecret: secret?.substring(0, 5) + "...",
        expectedSecret: CRON_SECRET.substring(0, 5) + "...",
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { websiteId, newLinks } = await request.json();
    console.log("Processing notification request:", {
      websiteId,
      newLinksCount: newLinks?.length,
    });

    if (!websiteId || !newLinks) {
      console.error("Missing required fields:", { websiteId, newLinks });
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Use admin client for cron operations
    const client = supabaseAdmin || supabase;

    // Get monitoring rules for this website
    console.log("Fetching monitoring rules for website:", websiteId);
    const { data: rules, error: rulesError } = await client
      .from("monitoring_rules")
      .select("*")
      .eq("website_id", websiteId)
      .eq("enabled", true)
      .eq("type", "CONTENT_CHANGE");

    if (rulesError) {
      console.error("Error fetching monitoring rules:", rulesError);
      return NextResponse.json(
        { error: "Failed to fetch monitoring rules" },
        { status: 500 }
      );
    }

    console.log("Found monitoring rules:", {
      count: rules?.length || 0,
      rules: rules?.map((r: any) => ({ id: r.id, email: r.notifyEmail })),
    });

    if (!rules || rules.length === 0) {
      console.log("No active monitoring rules found for website:", websiteId);
      return NextResponse.json({ message: "No monitoring rules found" });
    }

    // Get the website URL for the email
    console.log("Fetching website details for:", websiteId);
    const { data: website, error: websiteError } = await client
      .from("websites")
      .select("url")
      .eq("id", websiteId)
      .single();

    if (websiteError) {
      console.error("Error fetching website:", websiteError);
      return NextResponse.json(
        { error: "Failed to fetch website details" },
        { status: 500 }
      );
    }

    console.log("Found website:", website);

    if (!website) {
      console.error("Website not found:", websiteId);
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Process each rule
    const results = [];
    for (const rule of rules) {
      try {
        console.log("Processing rule:", {
          ruleId: rule.id,
          email: rule.notifyEmail,
        });

        await monitoringService.sendNotification(
          rule.notifyEmail,
          website.url,
          newLinks
        );
        console.log("Notification sent successfully for rule:", rule.id);

        console.log("Updating rule last_triggered timestamp");
        const { error: updateError } = await client
          .from("monitoring_rules")
          .update({ last_triggered: new Date().toISOString() })
          .eq("id", rule.id);

        if (updateError) {
          console.error("Error updating rule timestamp:", updateError);
        } else {
          console.log("Rule updated successfully");
        }

        results.push({ ruleId: rule.id, success: true });
      } catch (error) {
        console.error(`Error processing rule ${rule.id}:`, error);
        results.push({ ruleId: rule.id, success: false, error: String(error) });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error("Error sending notifications:", error);
    return NextResponse.json(
      { error: "Failed to send notifications" },
      { status: 500 }
    );
  }
}
