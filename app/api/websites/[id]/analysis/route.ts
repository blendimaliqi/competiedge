import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request, context: any) {
  try {
    const websiteId = context.params.id;
    console.log("Checking analysis results for website:", websiteId);

    // Check for cron secret if provided
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

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

    // Get the latest two snapshots to compare
    const { data: snapshots, error: snapshotsError } = await supabase
      .from("content_snapshots")
      .select("*")
      .eq("website_id", websiteId)
      .order("created_at", { ascending: false })
      .limit(2);

    if (snapshotsError) {
      console.error("Error fetching snapshots:", snapshotsError);
      return NextResponse.json(
        { error: "Failed to fetch snapshots" },
        { status: 500 }
      );
    }

    if (!snapshots || snapshots.length < 2) {
      console.log("Not enough snapshots for comparison");
      return NextResponse.json({ newLinks: [] });
    }

    const [currentSnapshot, previousSnapshot] = snapshots;
    const currentLinks = currentSnapshot.metrics.links || [];
    const previousLinks = previousSnapshot.metrics.links || [];

    // Find new links
    const newLinks = currentLinks.filter(
      (link: string) => !previousLinks.includes(link)
    );

    console.log("Analysis results:", {
      websiteId,
      newLinksFound: newLinks.length,
    });

    return NextResponse.json({
      status: "completed",
      newLinks,
    });
  } catch (error) {
    console.error("Error checking analysis:", error);
    return NextResponse.json(
      { error: "Failed to check analysis" },
      { status: 500 }
    );
  }
}
