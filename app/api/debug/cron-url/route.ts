import { NextResponse } from "next/server";
import { getCronUrl } from "@/lib/utils";

export async function GET() {
  const baseUrl = "https://competiedge.vercel.app";
  const cronUrl = getCronUrl(baseUrl);

  return NextResponse.json({
    url: cronUrl,
    secret: process.env.CRON_SECRET,
    encoded: encodeURIComponent(process.env.CRON_SECRET || ""),
  });
}
