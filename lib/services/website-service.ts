import { Website, Article } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { Database } from "@/lib/database.types";
import { parseDate } from "../utils";

type ArticleRow = Database["public"]["Tables"]["articles"]["Row"];

export async function getWebsites(
  categoryId: string | null = null
): Promise<Website[]> {
  let query = supabase.from("websites").select(`
      *,
      articles(*)
    `);

  if (categoryId === null) {
    query = query.is("category_id", null);
  } else {
    query = query.eq("category_id", categoryId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((website) => ({
    ...website,
    lastChecked: website.last_checked,
    createdAt: website.created_at,
    articleCount: website.article_count,
    customContentPatterns: website.custom_content_patterns || [],
    customSkipPatterns: website.custom_skip_patterns || [],
    articles: website.articles?.map((article: any) => ({
      id: article.id,
      title: article.title,
      url: article.url,
      path: article.path,
      summary: article.summary || undefined,
      date: article.published_date || undefined,
      firstSeen: article.first_seen,
    })),
  }));
}

export async function updateWebsite(id: string): Promise<Website> {
  try {
    console.log("Starting website update for ID:", id);

    // First, just get the basic website info without articles
    const { data: website, error: websiteError } = await supabase
      .from("websites")
      .select("*")
      .eq("id", id)
      .single();

    if (websiteError) {
      console.error("Error fetching website:", websiteError);
      throw websiteError;
    }

    // Update the last checked timestamp
    const { data: updatedWebsite, error: updateError } = await supabase
      .from("websites")
      .update({
        last_checked: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating website:", updateError);
      throw updateError;
    }

    // Return the basic website info
    return {
      ...updatedWebsite,
      articles: [], // Articles will be updated in the background
    };
  } catch (error) {
    console.error("Failed to update website:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to update website: ${error.message}`);
    }
    throw error;
  }
}

export async function addWebsite(website: Partial<Website>): Promise<Website> {
  try {
    if (!process.env.NEXT_PUBLIC_APP_URL) {
      throw new Error("NEXT_PUBLIC_APP_URL is not set");
    }

    // Detect RSS feed through API endpoint
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL}/api/rss/detect`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: website.url }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("RSS feed detection failed:", {
        status: response.status,
        error: errorText,
      });
      throw new Error(`Failed to detect RSS feed: ${errorText}`);
    }

    const { feedUrl } = await response.json();

    const { data, error } = await supabase
      .from("websites")
      .insert({
        name: website.name,
        url: website.url,
        article_count: 0,
        feed_url: feedUrl,
        feed_enabled: !!feedUrl,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error("Failed to add website:", error);
    throw error;
  }
}

export async function updateWebsitePatterns(
  websiteId: string,
  customContentPatterns?: string[],
  customSkipPatterns?: string[]
): Promise<Website> {
  const response = await fetch(`/api/websites/${websiteId}/patterns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      customContentPatterns,
      customSkipPatterns,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to update website patterns");
  }

  return response.json();
}

export async function deleteWebsite(id: string): Promise<void> {
  const response = await fetch(`/api/websites/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.error || "Failed to delete website");
  }
}
