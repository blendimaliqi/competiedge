import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ApiResponse } from "@/lib/types";

interface RouteParams {
  params: {
    id: string;
  };
}

export async function POST(
  request: Request,
  { params }: RouteParams
): Promise<NextResponse<ApiResponse<{ success: boolean }>>> {
  try {
    const { hidden } = await request.json();
    const { id } = params;

    const { error } = await supabase
      .from("articles")
      .update({ hidden })
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update article visibility:", error);
    return NextResponse.json(
      { error: "Failed to update article visibility" },
      { status: 500 }
    );
  }
}
