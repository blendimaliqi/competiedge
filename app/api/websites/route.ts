import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { Website, ApiResponse } from "@/lib/types";
import { CreateWebsiteRequestBody } from "@/lib/types/api";
import { Database } from "@/lib/database.types";

type WebsiteRow = Database["public"]["Tables"]["websites"]["Row"];
type ArticleRow = Database["public"]["Tables"]["articles"]["Row"];

export async function GET(): Promise<NextResponse<ApiResponse<Website[]>>> {
  try {
    const { data: websites, error } = await supabase.from("websites").select(`
        *,
        articles (*)
      `);

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Database error: " + error.message },
        { status: 500 }
      );
    }

    const mappedWebsites = websites?.map(
      (website: WebsiteRow & { articles?: ArticleRow[] }) => ({
        id: website.id,
        name: website.name,
        url: website.url,
        articleCount: website.article_count,
        lastChecked: website.last_checked,
        createdAt: website.created_at,
        customContentPatterns: website.custom_content_patterns || [],
        customSkipPatterns: website.custom_skip_patterns || [],
        articles: website.articles?.map((article: ArticleRow) => ({
          id: article.id,
          title: article.title,
          url: article.url,
          path: article.path,
          summary: article.summary || undefined,
          date: article.published_date || undefined,
          firstSeen: article.first_seen,
        })),
      })
    ) as Website[];

    return NextResponse.json(mappedWebsites || []);
  } catch (error) {
    console.error("Failed to get websites:", error);
    return NextResponse.json(
      { error: "Failed to get websites" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse<Website>>> {
  try {
    const body: CreateWebsiteRequestBody = await request.json();

    const { data: website, error } = await supabase
      .from("websites")
      .insert({
        name: body.name,
        url: body.url,
        article_count: 0,
        last_checked: null,
        created_at: new Date().toISOString(),
        custom_content_patterns: body.customContentPatterns || [],
        custom_skip_patterns: body.customSkipPatterns || [],
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);
      return NextResponse.json(
        { error: "Failed to add website: " + error.message },
        { status: 500 }
      );
    }

    const mappedWebsite: Website = {
      id: website.id,
      name: website.name,
      url: website.url,
      articleCount: 0,
      lastChecked: null,
      createdAt: website.created_at,
      customContentPatterns: website.custom_content_patterns || [],
      customSkipPatterns: website.custom_skip_patterns || [],
      articles: [],
    };

    return NextResponse.json(mappedWebsite);
  } catch (error) {
    console.error("Failed to add website:", error);
    return NextResponse.json(
      { error: "Failed to add website" },
      { status: 500 }
    );
  }
}
