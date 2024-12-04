import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { MonitoringRule } from "@/lib/types/monitoring";
import { Database } from "@/lib/database.types";

export async function POST(request: Request) {
  try {
    // Initialize Supabase client with cookie store
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("No user ID found in session");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await request.json();
    console.log("Received monitoring rule data:", json);

    // Set default values for required fields
    const {
      websiteId,
      type = "CONTENT_CHANGE",
      threshold = type === "CONTENT_CHANGE" ? 0 : 1,
      keyword,
      enabled = true,
      notifyEmail,
    } = json;

    // Validate required fields
    if (!websiteId) {
      return NextResponse.json(
        { error: "Website ID is required" },
        { status: 400 }
      );
    }

    if (!type) {
      return NextResponse.json(
        { error: "Monitoring type is required" },
        { status: 400 }
      );
    }

    if (!notifyEmail) {
      return NextResponse.json(
        { error: "Notification email is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("monitoring_rules")
      .insert([
        {
          website_id: websiteId,
          type,
          threshold,
          keyword,
          enabled,
          notify_email: notifyEmail,
          created_by: user.id,
          created_at: new Date().toISOString(),
          last_triggered: null,
        },
      ])
      .select();

    if (error) {
      console.error("Error creating monitoring rule:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data[0]);
  } catch (error) {
    console.error("Error in monitoring rules POST:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    // Initialize Supabase client with cookie store
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // Get authenticated user
    const {
      data: { session },
      error: authError,
    } = await supabase.auth.getSession();

    if (authError) {
      console.error("Auth error:", authError);
      return NextResponse.json(
        { error: "Authentication error", details: authError.message },
        { status: 401 }
      );
    }

    if (!session?.user?.id) {
      console.error("No user ID found in session");
      return NextResponse.json(
        { error: "Unauthorized - Invalid session" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const websiteId = searchParams.get("websiteId");

    const query = supabase
      .from("monitoring_rules")
      .select("*")
      .eq("created_by", session.user.id);

    if (websiteId) {
      query.eq("website_id", websiteId);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Database error:", error);
      return NextResponse.json(
        { error: "Failed to fetch rules", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
