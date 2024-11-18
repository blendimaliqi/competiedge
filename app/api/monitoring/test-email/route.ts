import { NextResponse } from "next/server";
import { monitoringService } from "@/lib/services/monitoring-service";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    await monitoringService.checkArticleCountRule({
      id: "test",
      websiteId: "test",
      type: "ARTICLE_COUNT",
      threshold: 0, // Set to 0 to ensure it triggers
      enabled: true,
      notifyEmail: "blendi.maliqi93@gmail.com",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to send test email:", error);
    return NextResponse.json(
      { error: "Failed to send test email" },
      { status: 500 }
    );
  }
}
