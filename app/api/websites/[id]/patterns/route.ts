import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { Website, ApiResponse } from "@/lib/types";
import {
  WebsiteRouteParams,
  UpdateWebsitePatternsRequestBody,
} from "@/lib/types/api";

export async function POST(
  request: Request,
  { params }: any
): Promise<NextResponse<ApiResponse<Website>>> {
  try {
    const id = (await params).id;
    const body: UpdateWebsitePatternsRequestBody = await request.json();

    const { data: website, error } = await supabase
      .from("websites")
      .update({
        custom_content_patterns: body.customContentPatterns,
        custom_skip_patterns: body.customSkipPatterns,
      })
      .eq("id", id)
      .select()
      .single();

    return NextResponse.json(website);
  } catch (error) {
    console.error("Failed to update patterns:", error);
    return NextResponse.json(
      { error: "Failed to update patterns" },
      { status: 500 }
    );
  }
}
