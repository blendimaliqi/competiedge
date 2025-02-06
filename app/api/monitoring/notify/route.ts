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
    const authHeader = request.headers.get("authorization");
    const serviceRoleKey = authHeader?.replace("Bearer ", "");

    if (
      !CRON_SECRET ||
      secret !== CRON_SECRET ||
      !serviceRoleKey ||
      serviceRoleKey !== process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { websiteId, newLinks } = await request.json();

    if (!websiteId || !newLinks?.length) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Use admin client for cron operations
    const client = supabaseAdmin || supabase;

    // Get website URL first
    const { data: website } = await client
      .from("websites")
      .select("url")
      .eq("id", websiteId)
      .single();

    if (!website?.url) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Get only necessary fields and process in batches
    const batchSize = 50;
    let processedCount = 0;
    let failedCount = 0;
    let lastError = null;

    // Stream rules in batches using range
    for (let offset = 0; ; offset += batchSize) {
      const {
        data: rules,
        error: rulesError,
        count,
      } = await client
        .from("monitoring_rules")
        .select("id, notify_email", { count: "exact" })
        .eq("website_id", websiteId)
        .eq("enabled", true)
        .eq("type", "CONTENT_CHANGE")
        .range(offset, offset + batchSize - 1);

      if (rulesError) {
        console.error("Error fetching rules batch:", rulesError);
        continue;
      }

      if (!rules?.length) break;

      // Log progress only on first batch
      if (offset === 0) {
        console.log(`Processing notifications for ${count} rules`);
      }

      // Process rules in current batch
      for (const rule of rules) {
        try {
          await monitoringService.sendNotification(
            rule.notify_email,
            website.url,
            newLinks
          );

          // Update last_triggered with minimal payload
          await client
            .from("monitoring_rules")
            .update({ last_triggered: new Date().toISOString() })
            .eq("id", rule.id);

          processedCount++;
        } catch (error) {
          console.error(`Error processing rule ${rule.id}:`, error);
          failedCount++;
          lastError = error;
        }
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        processed: processedCount,
        failed: failedCount,
        lastError: lastError ? String(lastError) : null,
      },
    });
  } catch (error) {
    console.error("Error sending notifications:", error);
    return NextResponse.json(
      { error: "Failed to send notifications" },
      { status: 500 }
    );
  }
}
