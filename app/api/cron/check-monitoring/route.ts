import { NextResponse } from "next/server";
import { monitoringService } from "@/lib/services/monitoring-service";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    console.log("Received secret:", secret);
    console.log("Expected secret:", CRON_SECRET);

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

    await monitoringService.checkAllRules();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to check monitoring rules:", error);
    return NextResponse.json(
      { error: "Failed to check monitoring rules" },
      { status: 500 }
    );
  }
}
