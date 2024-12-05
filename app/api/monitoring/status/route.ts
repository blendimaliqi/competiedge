import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { monitoringService } from "@/lib/services/monitoring-service";
import { Database } from "@/lib/database.types";

// Get monitoring status
export async function GET(request: Request) {
  try {
    const status = await monitoringService.getMonitoringStatus();
    return NextResponse.json(status);
  } catch (error) {
    console.error("Failed to get monitoring status:", error);
    return NextResponse.json(
      { error: "Failed to get monitoring status" },
      { status: 500 }
    );
  }
}

// Update monitoring status (pause/resume)
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
        { error: "Authentication error" },
        { status: 401 }
      );
    }

    if (!session?.user?.id) {
      console.error("No user ID found in session");
      return NextResponse.json(
        { error: "You must be signed in to control monitoring" },
        { status: 401 }
      );
    }

    const { action } = await request.json();

    if (action === "pause") {
      const result = await monitoringService.pauseMonitoring(session.user.id);
      return NextResponse.json({ success: true, data: result });
    } else if (action === "resume") {
      const result = await monitoringService.resumeMonitoring(session.user.id);
      return NextResponse.json({ success: true, data: result });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'pause' or 'resume'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Failed to update monitoring status:", error);
    return NextResponse.json(
      { error: "Failed to update monitoring status" },
      { status: 500 }
    );
  }
}
