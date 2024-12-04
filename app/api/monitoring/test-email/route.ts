import { NextResponse } from "next/server";
import { monitoringService } from "@/lib/services/monitoring-service";

export async function POST(request: Request) {
  try {
    console.log("Test email endpoint called");
    const { email } = await request.json();
    console.log("Sending test email to:", email);

    await monitoringService.checkArticleCountRule({
      id: "test",
      websiteId: "test",
      type: "ARTICLE_COUNT",
      threshold: 0,
      enabled: true,
      notifyEmail: email,
    });

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
