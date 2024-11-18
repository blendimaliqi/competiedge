import { NextResponse } from "next/server";
import { monitoringService } from "@/lib/services/monitoring-service";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    await monitoringService.checkArticleCountRule({
      id: "test",
      websiteId: "test",
      type: "ARTICLE_COUNT",
      threshold: 1,
      enabled: true,
      notifyEmail: email,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to send test email" },
      { status: 500 }
    );
  }
}
