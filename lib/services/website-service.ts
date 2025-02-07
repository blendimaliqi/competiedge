import { Website, Article } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { Database } from "@/lib/database.types";

type ArticleRow = Database["public"]["Tables"]["articles"]["Row"];

export class WebsiteService {
  private async validateAccess(
    websiteId: string,
    secret?: string
  ): Promise<void> {
    if (secret) {
      const { data: website, error } = await supabase
        .from("websites")
        .select("update_secret")
        .eq("id", websiteId)
        .single();

      if (error) {
        console.error("Error validating website access:", error);
        throw new Error("Failed to validate website access");
      }

      if (website.update_secret !== secret) {
        throw new Error("Invalid update secret");
      }
    }
  }

  async getWebsiteDetails(websiteId: string): Promise<Website> {
    const { data: website, error } = await supabase
      .from("websites")
      .select(
        `
        *,
        articles(*),
        monitoring_rules(*)
      `
      )
      .eq("id", websiteId)
      .single();

    if (error) {
      console.error("Error fetching website details:", error);
      throw new Error("Failed to fetch website details");
    }

    return {
      ...website,
      lastChecked: website.last_checked,
      createdAt: website.created_at,
      articleCount: website.article_count,
      customContentPatterns: website.custom_content_patterns || [],
      customSkipPatterns: website.custom_skip_patterns || [],
      monitoringRules:
        website.monitoring_rules?.map((rule: any) => ({
          id: rule.id,
          enabled: rule.enabled,
          notifyEmail: rule.notify_email,
          type: rule.type,
          lastTriggered: rule.last_triggered,
        })) || [],
      articles: website.articles?.map((article: ArticleRow) => ({
        id: article.id,
        title: article.title,
        url: article.url,
        path: article.path,
        summary: article.summary || undefined,
        date: article.published_date || undefined,
        firstSeen: article.first_seen,
      })),
    };
  }

  private async updateLastChecked(websiteId: string): Promise<void> {
    const { error } = await supabase
      .from("websites")
      .update({
        last_checked: new Date().toISOString(),
      })
      .eq("id", websiteId);

    if (error) {
      console.error("Error updating last checked timestamp:", error);
      throw new Error("Failed to update last checked timestamp");
    }
  }

  private async insertNewArticles(
    websiteId: string,
    articles: Article[]
  ): Promise<void> {
    if (articles.length === 0) {
      return;
    }

    const { error } = await supabase.from("articles").insert(
      articles.map((article) => ({
        website_id: websiteId,
        title: article.title,
        url: article.url,
        path: article.path,
        summary: article.summary,
        published_date: article.date,
        first_seen: new Date().toISOString(),
      }))
    );

    if (error) {
      console.error("Error inserting new articles:", error);
      throw new Error("Failed to insert new articles");
    }

    // Update article count using a subquery
    const { error: updateError } = await supabase
      .from("websites")
      .update({
        article_count: supabase
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("website_id", websiteId),
      })
      .eq("id", websiteId);

    if (updateError) {
      console.error("Error updating article count:", updateError);
      throw new Error("Failed to update article count");
    }
  }

  async updateWebsite({
    websiteId,
    secret,
  }: {
    websiteId: string;
    secret?: string;
  }): Promise<{ newArticles: Article[] }> {
    console.log(`Starting website update for ID: ${websiteId}`);

    try {
      // Validate access if secret is provided
      await this.validateAccess(websiteId, secret);

      // Get website details
      const website = await this.getWebsiteDetails(websiteId);

      // Update last checked timestamp
      await this.updateLastChecked(websiteId);

      // Make request to scraping API endpoint
      const response = await fetch(
        `/api/scrape?url=${encodeURIComponent(website.url)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to scrape website");
      }

      const { articles: scrapedArticles } = await response.json();

      // Filter out existing articles
      const existingUrls = new Set(website.articles?.map((a) => a.url) || []);
      const newArticles = scrapedArticles.filter(
        (article: Article) => !existingUrls.has(article.url)
      );

      console.log(`Found ${newArticles.length} new articles`);

      // Insert new articles
      await this.insertNewArticles(websiteId, newArticles);

      return { newArticles };
    } catch (error) {
      console.error("Failed to update website:", error);
      if (error instanceof Error) {
        throw new Error(`Failed to update website: ${error.message}`);
      }
      throw error;
    }
  }

  // Keep existing methods but update them to use the new consolidated functionality
  async getWebsites(categoryId: string | null = null): Promise<Website[]> {
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
      console.error("Error fetching websites:", error);
      throw new Error("Failed to fetch websites");
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

  async updateWebsitePatterns(
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

  async deleteWebsite(id: string): Promise<void> {
    const response = await fetch(`/api/websites/${id}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || "Failed to delete website");
    }
  }

  async addWebsite(data: {
    name: string;
    url: string;
    customContentPatterns?: string[];
    customSkipPatterns?: string[];
  }) {
    try {
      const { data: website, error } = await supabase
        .from("websites")
        .insert({
          name: data.name,
          url: data.url,
          custom_content_patterns: data.customContentPatterns || [],
          custom_skip_patterns: data.customSkipPatterns || [],
          article_count: 0,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("Error adding website:", error);
        throw new Error("Failed to add website");
      }

      return {
        ...website,
        lastChecked: website.last_checked,
        createdAt: website.created_at,
        articleCount: website.article_count,
        customContentPatterns: website.custom_content_patterns || [],
        customSkipPatterns: website.custom_skip_patterns || [],
      };
    } catch (error) {
      console.error("Failed to add website:", error);
      throw error;
    }
  }
}

// Export a singleton instance
export const websiteService = new WebsiteService();
export const addWebsite = websiteService.addWebsite.bind(websiteService);
