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

    // Update the website basic info first
    const updatedWebsite = await updateWebsite(websiteId);
    console.log("Website basic info updated:", updatedWebsite);

    // Start content analysis in the background
    const analyzePromise = (async () => {
      try {
        // Get current content analysis
        console.log("Analyzing content for URL:", updatedWebsite.url);
        const response = await fetch(
          process.env.NEXT_PUBLIC_APP_URL + "/api/analyze-content",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: updatedWebsite.url }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Content analysis failed:", {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
          });
          return;
        }

        const { metrics: currentMetrics } = await response.json();

        // Store the new snapshot
        console.log("Storing new snapshot for website:", websiteId);
        const { error: insertError } = await supabase
          .from("content_snapshots")
          .insert({
            website_id: websiteId,
            metrics: currentMetrics,
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          console.error("Error storing snapshot:", insertError);
          return;
        }

        // Get the latest two snapshots to compare
        const { data: snapshots, error: snapshotsError } = await supabase
          .from("content_snapshots")
          .select("*")
          .eq("website_id", websiteId)
          .order("created_at", { ascending: false })
          .limit(2);

        if (snapshotsError || !snapshots || snapshots.length < 2) {
          console.log("Not enough snapshots for comparison");
          return;
        }

        const [currentSnapshot, previousSnapshot] = snapshots;
        const previousLinks = previousSnapshot.metrics.links || [];
        const newLinks = currentMetrics.links.filter(
          (link: string) => !previousLinks.includes(link)
        );

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
      } catch (error) {
        console.error("Error in background analysis:", error);
      }
    })();

    // Return success immediately, let the analysis continue in the background
    return NextResponse.json({
      website: updatedWebsite,
      message: "Update initiated",
    });
  } catch (error) {
    console.error("Error updating website:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      {
        error: "Failed to update website",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
