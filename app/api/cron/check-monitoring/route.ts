import { NextResponse } from "next/server";
import { monitoringService } from "@/lib/services/monitoring-service";

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");

    if (secret !== CRON_SECRET) {
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
