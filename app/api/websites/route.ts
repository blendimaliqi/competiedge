import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
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

    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies });

    // First get all active monitoring rules
    const { data: rules, error: rulesError } = await supabase
      .from("monitoring_rules")
      .select("website_id")
      .eq("enabled", true)
      .eq("type", "CONTENT_CHANGE");

    if (rulesError) {
      console.error("Error fetching monitoring rules:", rulesError);
      return NextResponse.json({ error: rulesError.message }, { status: 500 });
    }

    // Get unique website IDs from rules using Array.from instead of spread
    const websiteIds = Array.from(
      new Set(rules.map((rule) => rule.website_id))
    );

    if (websiteIds.length === 0) {
      console.log("No websites with active monitoring rules found");
      return NextResponse.json({ data: [] });
    }

    // Get only the websites that have active monitoring rules
    const { data: websites, error: websitesError } = await supabase
      .from("websites")
      .select("*")
      .in("id", websiteIds)
      .order("created_at", { ascending: true });

    if (websitesError) {
      console.error("Error fetching websites:", websitesError);
      return NextResponse.json(
        { error: websitesError.message },
        { status: 500 }
      );
    }

    console.log(
      `Found ${websites.length} websites with active monitoring rules`
    );
    return NextResponse.json({ data: websites });
  } catch (error) {
    console.error("Error in GET /api/websites:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
