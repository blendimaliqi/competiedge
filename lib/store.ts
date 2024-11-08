import { Website, Article } from "./types";
import { supabase } from "./supabase";
import { Database } from "./database.types";

type WebsiteRow = Database["public"]["Tables"]["websites"]["Row"];
type ArticleRow = Database["public"]["Tables"]["articles"]["Row"];

class Store {
  async getAllWebsites(): Promise<Website[]> {
    const { data: websites, error } = await supabase.from("websites").select(`
        *,
        articles (*)
      `);

    if (error) throw error;

    return websites.map(this.mapWebsiteFromRow);
  }

  async getWebsite(id: string): Promise<Website | undefined> {
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

    if (error) return undefined;
    return this.mapWebsiteFromRow(website);
  }

  async addWebsite(website: Omit<Website, "id">): Promise<Website> {
    const { data, error } = await supabase
      .from("websites")
      .insert({
        name: website.name,
        url: website.url,
        article_count: website.articleCount,
        custom_content_patterns: website.customContentPatterns,
        custom_skip_patterns: website.customSkipPatterns,
      })
      .select()
      .single();

    if (error) throw error;
    return this.mapWebsiteFromRow(data);
  }

  async updateWebsitePatterns(
    id: string,
    customContentPatterns: string[],
    customSkipPatterns: string[]
  ): Promise<Website> {
    const { data, error } = await supabase
      .from("websites")
      .update({
        custom_content_patterns: customContentPatterns,
        custom_skip_patterns: customSkipPatterns,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return this.mapWebsiteFromRow(data);
  }

  async updateWebsite(website: Website): Promise<Website> {
    const { data, error } = await supabase
      .from("websites")
      .update({
        name: website.name,
        url: website.url,
        article_count: website.articleCount,
        last_checked: new Date().toISOString(),
        custom_content_patterns: website.customContentPatterns,
        custom_skip_patterns: website.customSkipPatterns,
      })
      .eq("id", website.id)
      .select()
      .single();

    if (error) throw error;

    if (website.articles?.length) {
      const { error: articlesError } = await supabase.from("articles").insert(
        website.articles.map((article) => ({
          website_id: website.id,
          title: article.title,
          url: article.url,
          path: article.path,
          summary: article.summary,
          published_date: article.date,
          first_seen: article.firstSeen,
        }))
      );

      if (articlesError) throw articlesError;
    }

    return this.getWebsite(website.id) as Promise<Website>;
  }

  private mapWebsiteFromRow(
    row: WebsiteRow & { articles?: ArticleRow[] }
  ): Website {
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      articleCount: row.article_count,
      lastChecked: row.last_checked || new Date().toISOString(),
      createdAt: row.created_at || new Date().toISOString(),
      customContentPatterns: row.custom_content_patterns || [],
      customSkipPatterns: row.custom_skip_patterns || [],
      articles: row.articles?.map(this.mapArticleFromRow),
    };
  }

  private mapArticleFromRow(row: ArticleRow): Article {
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      path: row.path,
      summary: row.summary || undefined,
      date: row.published_date || undefined,
      firstSeen: row.first_seen || new Date().toISOString(),
    };
  }
}

export const store = new Store();
