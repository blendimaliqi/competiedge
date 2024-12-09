import { NextResponse } from "next/server";
import { monitoringService } from "@/lib/services/monitoring-service";
import { MonitoringRule } from "@/lib/types/monitoring";

export async function POST(request: Request) {
  try {
    console.log("Test email endpoint called");
    const { email } = await request.json();
    console.log("Sending test email to:", email);

    const testRule: MonitoringRule = {
      id: "test",
      website_id: "test",
      type: "ARTICLE_COUNT",
      threshold: 0,
      enabled: true,
      notify_email: email,
      created_at: new Date().toISOString(),
      created_by: "test",
      last_triggered: undefined,
    };

    await monitoringService.checkArticleCountRule(testRule);

    console.log("Test email sent successfully");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send test email:", error);
    // Return more detailed error information
    return NextResponse.json(
      {
        error: "Failed to send test email",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
