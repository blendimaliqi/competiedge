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
    const { data: website, error: websiteError } = await supabase
      .from("websites")
      .select("*, articles(*)")
      .eq("id", id)
      .single();

    if (websiteError) {
      console.error("Error fetching website:", websiteError);
      throw websiteError;
    }

    // Store existing articles to preserve history
    const existingArticles = (website.articles || []) as ArticleRow[];
    const existingUrls = new Set(
      existingArticles.map((article: ArticleRow) => article.url)
    );

    let newArticles: Article[] = [];
    let usedMethod = "";

    // Try RSS feed if available and enabled
    if (website.feed_url && website.feed_enabled) {
      try {
        console.log("Attempting RSS feed fetch for:", website.name);
        const response = await fetch("/api/rss/articles", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ feedUrl: website.feed_url }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch RSS feed");
        }

        const { articles: feedArticles } = await response.json();

        if (feedArticles && feedArticles.length > 0) {
          usedMethod = "RSS";
          newArticles = feedArticles.filter(
            (article: Article) => !existingUrls.has(article.url)
          );
          console.log(
            `Found ${newArticles.length} new articles via RSS for ${website.name}`
          );
        } else {
          console.log(
            "No articles found in RSS feed, not falling back to scraping"
          );
          newArticles = [];
        }
      } catch (error) {
        console.error("RSS feed error:", error);
        // Don't fall back to scraping if RSS is enabled but fails
        newArticles = [];
      }
    } else {
      // Only use scraping if RSS is not enabled
      console.log("Using web scraping for:", website.name);
      const response = await fetch("/api/scrape/dynamic", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: website.url }),
      });

      if (!response.ok) {
        throw new Error("Failed to scrape website");
      }

      const { articles: scrapedArticles } = await response.json();
      usedMethod = "Scraping";
      newArticles = scrapedArticles.filter(
        (article: Article) => !existingUrls.has(article.url)
      );
      console.log(
        `Found ${newArticles.length} new articles via scraping for ${website.name}`
      );
    }

    console.log(`Using ${usedMethod} method for ${website.name}`);

    // Update website with total article count
    const { data: updatedWebsite, error: updateError } = await supabase
      .from("websites")
      .update({
        article_count: existingArticles.length + newArticles.length,
        last_checked: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating website:", updateError);
      throw updateError;
    }

    // Insert only new articles with proper date handling
    if (newArticles.length > 0) {
      const articlesData = newArticles.map((article: Article) => ({
        website_id: id,
        title: article.title?.substring(0, 255) || "Untitled",
        url: article.url || "",
        path: article.path || "",
        summary: article.summary?.substring(0, 1000) || null,
        published_date: parseDate(article.date),
        first_seen: new Date().toISOString(),
        hidden: false,
      }));

      const { error: articlesError } = await supabase
        .from("articles")
        .insert(articlesData);

      if (articlesError) {
        console.error("Articles insert error:", articlesError);
        throw articlesError;
      }
    }

    // Get fresh articles data after update
    const { data: freshArticles, error: freshArticlesError } = await supabase
      .from("articles")
      .select("*")
      .eq("website_id", id)
      .order("first_seen", { ascending: false });

    if (freshArticlesError) {
      console.error("Error fetching fresh articles:", freshArticlesError);
      throw freshArticlesError;
    }

    // Map the database articles to the Article type
    const mappedArticles = freshArticles.map(
      (article: ArticleRow): Article => ({
        id: article.id,
        title: article.title,
        url: article.url,
        path: article.path,
        summary: article.summary || undefined,
        date: article.published_date || undefined,
        firstSeen: article.first_seen,
        hidden: article.hidden,
      })
    );

    // Return updated website with fresh articles
    return {
      ...updatedWebsite,
      articles: mappedArticles,
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
    // Detect RSS feed through API endpoint
    const response = await fetch("/api/rss/detect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: website.url }),
    });

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
