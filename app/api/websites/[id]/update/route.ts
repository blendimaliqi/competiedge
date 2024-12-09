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

    // Store the new snapshot
    console.log("Storing new snapshot for website:", websiteId);
    const { error: insertError } = await client
      .from("content_snapshots")
      .insert({
        website_id: websiteId,
        metrics: currentMetrics,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error("Error storing snapshot:", insertError);
      return NextResponse.json({
        website: updatedWebsite,
        message: "Update completed but failed to store snapshot",
        error: insertError.message,
      });
    }

    // Get the latest two snapshots to compare
    const { data: snapshots, error: snapshotsError } = await client
      .from("content_snapshots")
      .select("*")
      .eq("website_id", websiteId)
      .order("created_at", { ascending: false })
      .limit(2);

    if (snapshotsError || !snapshots || snapshots.length < 2) {
      console.log("Not enough snapshots for comparison");
      return NextResponse.json({
        website: updatedWebsite,
        message: "Update completed but not enough snapshots for comparison",
      });
    }

    const [currentSnapshot, previousSnapshot] = snapshots;
    const previousLinks = previousSnapshot.metrics.links || [];
    const newLinks = currentMetrics.links.filter(
      (link: string) => !previousLinks.includes(link)
    );

    console.log("Found new links:", newLinks.length);

    // If this is a cron job request and we found new links, send notifications
    if (secret === CRON_SECRET && newLinks.length > 0) {
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
