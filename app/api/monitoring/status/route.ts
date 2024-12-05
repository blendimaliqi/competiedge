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
    // Return a default state instead of an error
    return NextResponse.json({ enabled: true });
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

    if (!["pause", "resume"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Use 'pause' or 'resume'" },
        { status: 400 }
      );
    }

    try {
      const result =
        action === "pause"
          ? await monitoringService.pauseMonitoring(session.user.id)
          : await monitoringService.resumeMonitoring(session.user.id);

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      console.error(`Failed to ${action} monitoring:`, error);
      // Try to initialize the table and retry the operation
      await monitoringService.getMonitoringStatus(); // This will initialize if needed
      const result =
        action === "pause"
          ? await monitoringService.pauseMonitoring(session.user.id)
          : await monitoringService.resumeMonitoring(session.user.id);

      return NextResponse.json({ success: true, data: result });
    }
  } catch (error) {
    console.error("Failed to update monitoring status:", error);
    return NextResponse.json(
      { error: "Failed to update monitoring status. Please try again." },
      { status: 500 }
    );
  }
}
