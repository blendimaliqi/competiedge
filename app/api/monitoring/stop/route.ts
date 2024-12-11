import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { monitoringService } from "@/lib/services/monitoring-service";
import { Database } from "@/lib/database.types";

export async function POST(request: Request) {
  try {
    const cookieStore = cookies();
    const supabase = createRouteHandlerClient<Database>({
      cookies: () => cookieStore,
    });

    // Get authenticated user
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Session error:", sessionError);
      return NextResponse.json(
        { error: "Authentication error", details: sessionError },
        { status: 401 }
      );
    }

    if (!session?.user?.id) {
      console.error("No user ID found in session");
      return NextResponse.json(
        { error: "You must be signed in to stop monitoring" },
        { status: 401 }
      );
    }

    const { websiteId } = await request.json();

    if (!websiteId) {
      return NextResponse.json(
        { error: "Website ID is required" },
        { status: 400 }
      );
    }

    console.log(
      "Checking rules for website:",
      websiteId,
      "user:",
      session.user.id
    );

    // Verify the user owns this monitoring rule
    const { data: rules, error: rulesError } = await supabase
      .from("monitoring_rules")
      .select("id")
      .eq("website_id", websiteId)
      .eq("created_by", session.user.id)
      .eq("enabled", true);

    if (rulesError) {
      console.error("Error checking rules:", rulesError);
      return NextResponse.json(
        { error: "Failed to check monitoring rules", details: rulesError },
        { status: 500 }
      );
    }

    if (!rules || rules.length === 0) {
      return NextResponse.json(
        { error: "No active monitoring rules found for this website" },
        { status: 404 }
      );
    }

    console.log("Found rules to disable:", rules);

    try {
      const result = await monitoringService.stopMonitoring(
        websiteId,
        session.user.id
      );
      return NextResponse.json({ success: true, data: result });
    } catch (stopError: any) {
      console.error("Error in stopMonitoring:", stopError);
      return NextResponse.json(
        {
          error: "Failed to stop monitoring",
          details: stopError.message || String(stopError),
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Failed to stop monitoring:", error);
    return NextResponse.json(
      {
        error: "Failed to stop monitoring",
        details: error.message || String(error),
      },
      { status: 500 }
    );
  }
}
