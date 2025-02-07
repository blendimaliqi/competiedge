import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { websiteService } from "@/lib/services/website-service";
import { monitoringService } from "@/lib/services/monitoring-service";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request, context: any) {
  try {
    const websiteId = context.params.id;
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    console.log("Update endpoint called:", {
      websiteId,
      hasSecret: !!secret,
      secretMatch: secret === CRON_SECRET,
    });

    // For cron jobs, validate the secret
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
    } else {
      // For manual updates, validate the session
      const supabase = createRouteHandlerClient({ cookies });
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error("Session error:", sessionError);
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // Use the consolidated website service
    const { newArticles } = await websiteService.updateWebsite({
      websiteId,
      secret: secret || undefined,
    });

    // If there are new articles, handle monitoring notifications
    if (newArticles.length > 0) {
      try {
        // Use the monitoring service to handle notifications
        await monitoringService.handleWebsiteUpdate(websiteId, newArticles);
      } catch (error) {
        console.error("Error handling monitoring notifications:", error);
        // Don't fail the request if monitoring fails
      }
    }

    return NextResponse.json({
      message: "Website updated successfully",
      newArticles,
    });
  } catch (error) {
    console.error("Update error:", error);
    const message = error instanceof Error ? error.message : "Update failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
