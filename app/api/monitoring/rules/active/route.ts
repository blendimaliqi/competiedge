import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "@/lib/database.types";

export async function GET(request: Request) {
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
        { error: "Authentication error" },
        { status: 401 }
      );
    }

    if (!session?.user?.id) {
      console.error("No user ID found in session");
      return NextResponse.json(
        { error: "You must be signed in to view monitoring rules" },
        { status: 401 }
      );
    }

    // Get active rules for the user
    const { data: rules, error: rulesError } = await supabase
      .from("monitoring_rules")
      .select("*")
      .eq("enabled", true)
      .eq("created_by", session.user.id);

    if (rulesError) {
      console.error("Error fetching active rules:", rulesError);
      return NextResponse.json(
        { error: "Failed to fetch active rules" },
        { status: 500 }
      );
    }

    return NextResponse.json(rules);
  } catch (error) {
    console.error("Failed to get active rules:", error);
    return NextResponse.json(
      { error: "Failed to get active rules" },
      { status: 500 }
    );
  }
}
