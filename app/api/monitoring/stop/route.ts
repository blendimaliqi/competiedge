import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { monitoringService } from "@/lib/services/monitoring-service";

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { websiteId } = await request.json();

    if (!websiteId) {
      return NextResponse.json(
        { error: "Website ID is required" },
        { status: 400 }
      );
    }

    const result = await monitoringService.stopMonitoring(websiteId, user.id);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to stop monitoring:", error);
    return NextResponse.json(
      { error: "Failed to stop monitoring" },
      { status: 500 }
    );
  }
}
