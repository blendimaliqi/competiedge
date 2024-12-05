import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { updateWebsite } from "@/lib/services/website-service";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    // Get the website ID from the URL
    const websiteId = params.id;

    // Update the website and get new links
    const updatedWebsite = await updateWebsite(websiteId);

    // Get the previous snapshot to compare
    const supabase = createRouteHandlerClient({ cookies });
    const { data: previousSnapshot } = await supabase
      .from("content_snapshots")
      .select("*")
      .eq("website_id", websiteId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

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

    // Store the new snapshot
    await supabase.from("content_snapshots").insert({
      website_id: websiteId,
      metrics: currentMetrics,
      created_at: new Date().toISOString(),
    });

    // Find new links by comparing with previous snapshot
    let newLinks: string[] = [];
    if (previousSnapshot) {
      const previousLinks = previousSnapshot.metrics.links || [];
      newLinks = currentMetrics.links.filter(
        (link: string) => !previousLinks.includes(link)
      );
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
