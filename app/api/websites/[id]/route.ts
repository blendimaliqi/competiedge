import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { Article, Website, ApiResponse } from "@/lib/types";
import {
  WebsiteRouteParams,
  SuccessResponse,
  ErrorResponse,
} from "@/lib/types/api";
import { dynamicScraper } from "@/lib/services/dynamic-scraper";
import { Database } from "@/lib/database.types";

type ArticleRow = Database["public"]["Tables"]["articles"]["Row"];

class WebsiteController {
  async updateWebsiteAndArticles(
    id: string,
    articleCount: number,
    newArticles: Article[]
  ): Promise<void> {
    const { error: websiteError } = await supabase
      .from("websites")
      .update({
        article_count: articleCount,
        last_checked: new Date().toISOString(),
      })
      .eq("id", id);

    if (websiteError) throw websiteError;

    if (newArticles.length > 0) {
      const { error: articlesError } = await supabase.from("articles").insert(
        newArticles.map((article) => ({
          website_id: id,
          title: article.title?.substring(0, 255) || "Untitled",
          url: article.url,
          path: article.path,
          summary: article.summary?.substring(0, 1000),
          published_date: article.date,
          first_seen: article.firstSeen,
        }))
      );

      if (articlesError) {
        console.error("Articles insert error:", articlesError);
        throw articlesError;
      }
    }
  }

  async getUpdatedWebsite(id: string): Promise<Website> {
    const { data: website, error } = await supabase
      .from("websites")
      .select(`*, articles (*)`)
      .eq("id", id)
      .single();

    if (error) throw error;

    return {
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
        date: article.published_date,
        firstSeen: article.first_seen,
      })),
    };
  }
}

const controller = new WebsiteController();

export async function GET(
  request: Request,
  { params }: any
): Promise<NextResponse<ApiResponse<Website>>> {
  try {
    const { id } = params;
    const { data: website, error } = await supabase
      .from("websites")
      .select(
        `
        *,
        articles (*)
      `
      )
      .eq("id", id)
      .single();

    if (error || !website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    return NextResponse.json(website);
  } catch (error) {
    console.error("Failed to get website:", error);
    return NextResponse.json(
      { error: "Failed to get website" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: any
): Promise<NextResponse<ApiResponse<Website>>> {
  try {
    const id = (await params).id;
    const { data: website, error } = await supabase
      .from("websites")
      .select(`*, articles (*)`)
      .eq("id", id)
      .single();

    if (error || !website) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Use dynamic scraper with scrolling for article detection
    const { articles } = await dynamicScraper.scrape(website.url);

    const existingUrls = new Set(
      website.articles?.map((article: { url: string }) => article.url) || []
    );

    const newArticles = articles.filter(
      (article) => !existingUrls.has(article.url)
    );

    // Update website and insert new articles
    await controller.updateWebsiteAndArticles(id, articles.length, newArticles);

    // Get and return updated website data
    const updatedWebsite = await controller.getUpdatedWebsite(id);
    return NextResponse.json(updatedWebsite);
  } catch (error) {
    console.error("Update website error:", error);
    return NextResponse.json(
      { error: "Failed to update website" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: any
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    const id = (await params).id;

    const { error } = await supabase.from("websites").delete().eq("id", id);

    if (error) {
      console.error("Delete website error:", error);
      return NextResponse.json(
        { error: "Failed to delete website" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete website error:", error);
    return NextResponse.json(
      { error: "Failed to delete website" },
      { status: 500 }
    );
  }
}
