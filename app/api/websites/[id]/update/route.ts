import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { updateWebsite } from "@/lib/services/website-service";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request, context: any) {
  try {
    // Get the website ID from the URL
    const websiteId = context.params.id;
    console.log("Updating website:", websiteId);

    // Check for cron secret if provided
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    // Only verify secret if it's provided (cron job)
    if (secret) {
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
    }

    // Update the website and get new links
    const updatedWebsite = await updateWebsite(websiteId);
    console.log("Website updated:", updatedWebsite);

    // Get the previous snapshot to compare
    const { data: previousSnapshot } = await supabase
      .from("content_snapshots")
      .select("*")
      .eq("website_id", websiteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    console.log("Previous snapshot:", previousSnapshot);

    // Get current content analysis
    const response = await fetch(
      process.env.NEXT_PUBLIC_APP_URL + "/api/analyze-content",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: updatedWebsite.url }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to analyze content");
    }

    const { metrics: currentMetrics } = await response.json();
    console.log("Current metrics:", currentMetrics);

    // Store the new snapshot
    const { data: newSnapshot, error: snapshotError } = await supabase
      .from("content_snapshots")
      .insert({
        website_id: websiteId,
        metrics: currentMetrics,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (snapshotError) {
      console.error("Error storing snapshot:", snapshotError);
      throw snapshotError;
    }

    console.log("New snapshot stored:", newSnapshot);

    // Find new links by comparing with previous snapshot
    let newLinks: string[] = [];
    if (previousSnapshot) {
      const previousLinks = previousSnapshot.metrics.links || [];
      newLinks = currentMetrics.links.filter(
        (link: string) => !previousLinks.includes(link)
      );
      console.log("Found new links:", newLinks);
    }

    // If this is a cron job request (has secret), check for monitoring rules and send notifications
    if (secret === CRON_SECRET && newLinks.length > 0) {
      console.log("Cron job detected, sending notifications for new links");
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
        console.log("Notification response:", await notifyResponse.json());
      } catch (error) {
        console.error("Failed to send notifications:", error);
      }
    }

    return NextResponse.json({
      website: updatedWebsite,
      newLinks,
    });
  } catch (error) {
    console.error("Error updating website:", error);
    return NextResponse.json(
      { error: "Failed to update website" },
      { status: 500 }
    );
  }
}
