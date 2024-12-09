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

    try {
      // Update the website and get new links
      console.log("Calling updateWebsite for:", websiteId);
      const updatedWebsite = await updateWebsite(websiteId);
      console.log("Website updated successfully:", updatedWebsite);

      // Get the previous snapshot to compare
      console.log("Fetching previous snapshot for website:", websiteId);
      const { data: previousSnapshot, error: snapshotError } = await supabase
        .from("content_snapshots")
        .select("*")
        .eq("website_id", websiteId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (snapshotError) {
        console.error("Error fetching previous snapshot:", snapshotError);
      } else {
        console.log("Previous snapshot found:", {
          id: previousSnapshot?.id,
          created_at: previousSnapshot?.created_at,
          links: previousSnapshot?.metrics?.links?.length || 0,
        });
      }

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
        throw new Error(`Failed to analyze content: ${errorText}`);
      }

      const analysisResult = await response.json();
      const { metrics: currentMetrics } = analysisResult;
      console.log("Content analysis successful:", {
        links: currentMetrics.links?.length || 0,
        wordCount: currentMetrics.wordCount,
        images: currentMetrics.images,
      });

      // Store the new snapshot
      console.log("Storing new snapshot for website:", websiteId);
      const { data: newSnapshot, error: insertError } = await supabase
        .from("content_snapshots")
        .insert({
          website_id: websiteId,
          metrics: currentMetrics,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error storing snapshot:", insertError);
        throw insertError;
      }

      console.log("New snapshot stored successfully:", {
        id: newSnapshot.id,
        created_at: newSnapshot.created_at,
      });

      // Find new links by comparing with previous snapshot
      let newLinks: string[] = [];
      if (previousSnapshot) {
        console.log("Comparing links with previous snapshot:", {
          previousLinks: previousSnapshot.metrics.links?.length || 0,
          currentLinks: currentMetrics.links?.length || 0,
        });

        const previousLinks = previousSnapshot.metrics.links || [];
        newLinks = currentMetrics.links.filter(
          (link: string) => !previousLinks.includes(link)
        );
        console.log("Link comparison results:", {
          newLinksFound: newLinks.length,
          newLinks,
        });
      } else {
        console.log("No previous snapshot found for comparison");
      }

      // If this is a cron job request (has secret), check for monitoring rules and send notifications
      if (secret === CRON_SECRET && newLinks.length > 0) {
        console.log("Attempting to send notifications for new links:", {
          websiteId,
          newLinksCount: newLinks.length,
          appUrl: process.env.NEXT_PUBLIC_APP_URL,
        });
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

          const notifyResult = await notifyResponse.json();
          console.log("Notification response:", {
            status: notifyResponse.status,
            result: notifyResult,
          });

          if (!notifyResponse.ok) {
            console.error("Notification request failed:", notifyResult);
          }
        } catch (error) {
          console.error("Failed to send notifications:", error);
        }
      } else {
        console.log("Skipping notifications:", {
          hasCronSecret: secret === CRON_SECRET,
          hasNewLinks: newLinks.length > 0,
        });
      }

      return NextResponse.json({
        website: updatedWebsite,
        newLinks,
      });
    } catch (innerError) {
      console.error("Error in website update process:", {
        error:
          innerError instanceof Error ? innerError.message : String(innerError),
        stack: innerError instanceof Error ? innerError.stack : undefined,
      });
      throw innerError;
    }
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
