import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { MonitoringRule } from "@/lib/types/monitoring";

export async function POST(request: Request) {
  try {
    const rule: Omit<MonitoringRule, "id"> = await request.json();

    const { data, error } = await supabase
      .from("monitoring_rules")
      .insert({
        website_id: rule.websiteId,
        type: rule.type,
        threshold: rule.threshold,
        keyword: rule.keyword,
        enabled: rule.enabled,
        notify_email: rule.notifyEmail,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create monitoring rule" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const websiteId = searchParams.get("websiteId");

    const query = supabase.from("monitoring_rules").select("*");

    if (websiteId) {
      query.eq("website_id", websiteId);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch monitoring rules" },
      { status: 500 }
    );
  }
}
