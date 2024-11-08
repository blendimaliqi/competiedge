import * as cheerio from "cheerio";
import { Article } from "@/lib/types";

export class ArticleScraper {
  private userPatterns = [
    // English
    "/user/",
    "/users/",
    "/profile/",
    "/u/",
    "/member/",
    "/members/",
    "/author/",
    "@",
    "/account/",
    "/accounts/",
    // Norwegian
    "/bruker/",
    "/brukere/",
    "/profil/",
    "/medlem/",
    "/medlemmer/",
    "/forfatter/",
    "/konto/",
  ];

  private contentPatterns = [
    // English
    "/article/",
    "/post/",
    "/posts/",
    "/p/",
    "/story/",
    "/stories/",
    "/news/",
    "/news-",
    "news/",
    "/updates/",
    "/press/",
    "/press-releases/",
    "/media/",
    "/blog/",
    "/read/",
    "/watch/",
    "/video/",
    "/comments/",
    "/discussion/",
    "/thread/",
    "/t/",
    "/r/",
    "/topic/",
    // Norwegian
    "/artikkel/",
    "/innlegg/",
    "/nyhet/",
    "/nyheter/",
    "/sak/",
    "/saker/",
    "/blogg/",
    "/les/",
    "/se/",
    "/video/",
    "/kommentarer/",
    "/diskusjon/",
    "/trad/",
    "/tema/",
    "/aktuelt/",
    // Additional patterns
    "/products/",
    "/product/",
    "/solutions/",
    "/solution/",
    "/technologies/",
    "/technology/",
    "/services/",
    "/service/",
  ];

  private skipPaths = [
    // English
    "/tag/",
    "/category/",
    "/page/",
    "/search",
    "/login",
    "/register",
    "/about",
    "/contact",
    // Norwegian
    "/emneord/",
    "/kategori/",
    "/side/",
    "/sok/",
    "/logg-inn/",
    "/registrer/",
    "/om/",
    "/kontakt/",
    "/personvern/",
    "/vilkar/",
  ];

  private skipTitles = [
    // English
    "login",
    "sign in",
    "register",
    "subscribe",
    "cookie",
    "privacy policy",
    "terms of service",
    // Norwegian
    "logg inn",
    "registrer",
    "abonner",
    "informasjonskapsler",
    "personvern",
    "vilkår",
    "betingelser",
  ];

  constructor(
    private customContentPatterns: string[] = [],
    private customSkipPatterns: string[] = []
  ) {}

  private parseDate(dateStr: string | undefined): string | undefined {
    if (!dateStr) return undefined;

    try {
      const cleanDate = dateStr
        .trim()
        .replace(/\s+/g, " ")
        .split(/\s*\d{4}\s*/)
        .shift();

      if (!cleanDate) return new Date().toISOString();

      const date = new Date(cleanDate);
      const timestamp = date.getTime();

      const now = new Date();
      const maxDate = new Date(now.getFullYear() + 1, 11, 31);
      const minDate = new Date(2000, 0, 1);

      if (isNaN(timestamp) || date > maxDate || date < minDate) {
        return new Date().toISOString();
      }

      return date.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  public scrapeArticles(html: string, baseUrl: string): Article[] {
    const $ = cheerio.load(html);
    const articles: Article[] = [];
    const seenUrls = new Set<string>();

    const allContentPatterns = [
      ...this.contentPatterns,
      ...this.customContentPatterns,
    ];
    const allSkipPatterns = [...this.skipPaths, ...this.customSkipPatterns];

    $("a[href]").each((_, element) => {
      const $element = $(element);
      const href = $element.attr("href");

      if (!href || href.startsWith("javascript:") || href === "#") return;

      try {
        const url = href.startsWith("http")
          ? href
          : new URL(href, baseUrl).href;
        const urlObj = new URL(url);
        const path = urlObj.pathname.toLowerCase();

        if (this.shouldSkipUrl(path, url, seenUrls)) return;

        const title = $element.text().trim();
        if (this.shouldSkipTitle(title)) return;

        if (this.isContentUrl(path, allContentPatterns)) {
          const article = this.extractArticleData(
            $,
            $element,
            url,
            path,
            title
          );
          if (article) {
            seenUrls.add(url);
            articles.push(article);
          }
        }
      } catch (error) {
        console.error("Error processing URL:", href, error);
      }
    });

    return articles;
  }

  private shouldSkipUrl(
    path: string,
    url: string,
    seenUrls: Set<string>
  ): boolean {
    return (
      path === "/" ||
      this.userPatterns.some((pattern) => path.includes(pattern)) ||
      seenUrls.has(url) ||
      this.skipPaths.some((pattern) => path.includes(pattern)) ||
      /\/(wp-|feed|rss|cdn-cgi)/.test(path)
    );
  }

  private shouldSkipTitle(title: string): boolean {
    return (
      !title ||
      title.length < 10 ||
      this.skipTitles.some((text) => title.toLowerCase().includes(text))
    );
  }

  private isContentUrl(path: string, contentPatterns: string[]): boolean {
    const isContentPattern = contentPatterns.some((pattern) =>
      path.toLowerCase().includes(pattern.toLowerCase())
    );

    const hasContentStructure =
      path.split("/").length >= 2 &&
      path.split("/").pop()!.length > 3 &&
      /^[\w-æøåÆØÅ\/]+$/.test(path) &&
      !path.includes("page=") &&
      !path.includes("sort=") &&
      !path.match(/\d{4}\/\d{2}$/);

    return isContentPattern || hasContentStructure;
  }

  private extractArticleData(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>,
    url: string,
    path: string,
    title: string
  ): Article | null {
    const $container = $element.closest(
      "article, .article, .post, .entry, .item, div[class*='article'], div[class*='post'], div[class*='entry'], div[class*='news'], div[class*='blog'], div[class*='content']"
    );

    const date = this.parseDate(
      $container.find("time").attr("datetime") ||
        $container.find("time").text().trim() ||
        $container.find("[datetime]").attr("datetime") ||
        $container
          .find('.date, [class*="date"], .time, [class*="time"]')
          .text()
          .trim()
    );

    const summary = $container
      .find('p, .description, .summary, [class*="excerpt"], [class*="desc"]')
      .first()
      .text()
      .trim();

    return {
      title,
      url,
      path,
      date: date || new Date().toISOString(),
      summary: summary || undefined,
      firstSeen: new Date().toISOString(),
    };
  }
}
