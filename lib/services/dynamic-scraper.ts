import puppeteer, { Page, Browser } from "puppeteer-core";
import chrome from "@sparticuz/chromium";
import { Article } from "@/lib/types";

export class DynamicScraper {
  private readonly contentSelectors = [
    // Common article/content containers
    "article",
    ".article",
    ".post",
    ".entry",
    ".blog-post",
    ".news-item",
    ".content-item",

    // Common content sections
    '[class*="article"]',
    '[class*="post"]',
    '[class*="blog"]',
    '[class*="news"]',
    '[class*="content"]',
    '[class*="entry"]',

    // Common content wrappers
    ".main-content",
    ".page-content",
    ".container",
    ".wrapper",

    // Fallback to basic content structure
    "main",
    "section",
    ".card",
    ".item",
  ];

  private scrapingLocks: Map<
    string,
    { timestamp: number; promise: Promise<any>; error?: Error }
  > = new Map();
  private readonly LOCK_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Start periodic lock cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredLocks();
    }, this.LOCK_TIMEOUT);
  }

  // Clean up resources when service is destroyed
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  private cleanupExpiredLocks(): void {
    const now = Date.now();
    // Convert to array to avoid TypeScript iteration issues
    Array.from(this.scrapingLocks.entries()).forEach(([url, lock]) => {
      if (now - lock.timestamp > this.LOCK_TIMEOUT) {
        console.log(`Cleaning up expired lock for ${url}`);
        this.scrapingLocks.delete(url);
      }
    });
  }

  private async acquireLock(url: string): Promise<boolean> {
    const now = Date.now();
    const existingLock = this.scrapingLocks.get(url);

    if (existingLock) {
      // If lock is older than timeout, remove it
      if (now - existingLock.timestamp > this.LOCK_TIMEOUT) {
        console.log(`Lock expired for ${url}, removing`);
        this.scrapingLocks.delete(url);
        return true;
      }

      console.log(`Scraping already in progress for ${url}`);

      try {
        await existingLock.promise;
        // If we get here, the previous scrape succeeded
        console.log(`Reusing successful scrape results for ${url}`);
        return false;
      } catch (error) {
        // If the previous scrape failed, we should retry
        console.log(`Previous scrape of ${url} failed, will retry`);
        this.scrapingLocks.delete(url);
        return true;
      }
    }

    return true;
  }

  private setLock(url: string, promise: Promise<any>): void {
    const enhancedPromise = promise.catch((error) => {
      // Store the error so we can check it later
      const lock = this.scrapingLocks.get(url);
      if (lock) {
        lock.error = error;
      }
      throw error;
    });

    this.scrapingLocks.set(url, {
      timestamp: Date.now(),
      promise: enhancedPromise,
    });
  }

  private removeLock(url: string): void {
    this.scrapingLocks.delete(url);
  }

  private async isStaticSite(page: Page): Promise<boolean> {
    // Enhanced SPA detection - check for common SPA characteristics
    const isSPA = await page.evaluate(() => {
      // Check for SPA frameworks and build artifacts
      const hasSPAFramework = !!(
        (
          document.querySelector("#__next") || // Next.js
          document.querySelector("#root") || // React
          document.querySelector("#app") || // Vue
          document.querySelector("[ng-version]") || // Angular
          document.querySelector('script[type="module"]') || // Modern SPA
          document.querySelector('script[src*="react"]') || // React
          document.querySelector('script[src*="vue"]') || // Vue
          document.querySelector('script[src*="angular"]') || // Angular
          document.querySelector('meta[name*="react"]') || // React meta
          document.querySelector('meta[name*="vue"]') || // Vue meta
          window.hasOwnProperty("__NEXT_DATA__") || // Next.js
          window.hasOwnProperty("__NUXT__")
        ) // Nuxt.js
      );

      // Check for client-side routing indicators
      const hasClientRouting = !!(
        document.querySelector('script[src*="router"]') ||
        document.querySelector('a[href^="/"][href*=":"]') ||
        document.querySelector("div[data-route]") ||
        document.querySelector("[ui-view]") ||
        document.querySelector("[ng-view]")
      );

      // Check for dynamic loading indicators
      const hasDynamicLoading = !!(
        document.querySelector("[data-loading]") ||
        document.querySelector("[data-fetch]") ||
        document.querySelector("[data-hydrate]") ||
        document.querySelector(".loading-indicator") ||
        document.querySelector('[aria-busy="true"]')
      );

      // Check for state management indicators
      const hasStateManagement = !!(
        window.hasOwnProperty("__REDUX_STORE__") ||
        window.hasOwnProperty("__VUEX__") ||
        window.hasOwnProperty("__MOBX__") ||
        document.querySelector('script[src*="redux"]') ||
        document.querySelector('script[src*="vuex"]') ||
        document.querySelector('script[src*="mobx"]')
      );

      // Check for dynamic behavior indicators
      const hasDynamicBehavior = !!(
        document.querySelector('script[type="application/json"]') ||
        document.querySelector("[data-component]") ||
        document.querySelector("[data-reactroot]") ||
        document.querySelector("[data-v-app]") ||
        document.querySelector("[ng-app]") ||
        document.querySelector("[data-client]")
      );

      // Check for modern build tooling
      const hasModernBuild = !!(
        document.querySelector('script[src*="chunk"]') ||
        document.querySelector('script[src*="bundle"]') ||
        document.querySelector('script[src*="vendor"]') ||
        document.querySelector('link[href*="chunk"]') ||
        document.querySelector('link[href*="bundle"]')
      );

      return (
        hasSPAFramework ||
        hasClientRouting ||
        hasDynamicLoading ||
        hasStateManagement ||
        hasDynamicBehavior ||
        hasModernBuild ||
        // Check if the page has a significant number of event listeners
        document.querySelectorAll('[on*="click"],[on*="change"],[on*="input"]')
          .length > 10
      );
    });

    // If it's an SPA, we should treat it as dynamic
    if (isSPA) {
      console.log("Detected SPA characteristics");
      return false;
    }

    // Check for meaningful content as a fallback
    const hasArticleContent = await page.evaluate((selectors: string[]) => {
      const elements = document.querySelectorAll(selectors.join(", "));
      let meaningfulContent = false;

      elements.forEach((el) => {
        // Check if element has actual content and not just navigation/layout
        const hasLinks = el.querySelectorAll('a[href*="/"]').length > 0;
        const textLength = el.textContent?.trim()?.length || 0; // Add fallback to 0
        const hasText = textLength > 50;
        const isNotNav = !el.closest("nav, header, footer");

        if (hasLinks && hasText && isNotNav) {
          meaningfulContent = true;
        }
      });

      return meaningfulContent;
    }, this.contentSelectors);

    console.log("Site is", isSPA ? "dynamic (SPA)" : "static");
    return !isSPA;
  }

  async scrape(url: string): Promise<{ title: string; articles: Article[] }> {
    // Normalize URL to prevent duplicate scraping of same content
    const normalizedUrl = url.replace(/\/+$/, "");

    if (!(await this.acquireLock(normalizedUrl))) {
      console.log(
        `Reusing results from in-progress scrape of ${normalizedUrl}`
      );
      const lock = this.scrapingLocks.get(normalizedUrl);
      if (!lock) {
        throw new Error("Lock disappeared unexpectedly");
      }
      return lock.promise;
    }

    let browser: Browser | undefined;
    const scrapePromise = (async () => {
      try {
        let executablePath: string;
        let args: string[];

        if (process.env.AWS_LAMBDA_FUNCTION_VERSION) {
          // Running on Lambda/Vercel
          executablePath = await chrome.executablePath();
          args = chrome.args;
        } else {
          // Running locally - use system Chrome
          executablePath =
            process.platform === "win32"
              ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
              : process.platform === "darwin"
              ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
              : "/usr/bin/google-chrome";
          args = [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
          ];
        }

        browser = await puppeteer.launch({
          args,
          executablePath,
          headless: true,
          defaultViewport: {
            width: 1920,
            height: 1080,
          },
        });

        const page = await browser.newPage();
        await page.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );

        console.log("Navigating to URL:", normalizedUrl);
        await page.goto(normalizedUrl, {
          waitUntil: "networkidle0",
          timeout: 30000,
        });

        // Wait for any content to load
        await page.waitForSelector(
          'article, [class*="article"], [class*="post"], h1, h2, h3',
          { timeout: 30000 }
        );

        const title = await page.title();
        console.log("Page title:", title);

        const isStatic = await this.isStaticSite(page);

        if (isStatic) {
          const articles = await this.extractArticles(page);
          console.log(`Found ${articles.length} articles on static site`);
          return { title, articles };
        }

        let articles = await this.extractArticles(page);
        console.log(
          `Initially found ${articles.length} articles on dynamic site`
        );

        let previousLength = articles.length;
        let noNewContentCount = 0;
        const maxScrollAttempts = 5;

        for (let i = 0; i < maxScrollAttempts; i++) {
          console.log(`Scroll attempt ${i + 1}/${maxScrollAttempts}`);

          await page.evaluate(() => {
            window.scrollTo(0, document.body.scrollHeight);
          });

          await page.evaluate(
            () => new Promise((resolve) => setTimeout(resolve, 2000))
          );

          try {
            await page.waitForFunction(
              (prevCount: number) => {
                const elements = document.querySelectorAll(
                  'article, [class*="article"], [class*="post"], [role="article"]'
                );
                return elements.length > prevCount;
              },
              { timeout: 3000 },
              previousLength
            );
          } catch (e) {
            // No new content loaded
          }

          articles = await this.extractArticles(page);
          console.log(
            `Found ${articles.length} articles after scroll ${i + 1}`
          );

          if (articles.length === previousLength) {
            noNewContentCount++;
            if (noNewContentCount >= 2) {
              console.log(
                "No new content found after multiple scrolls, stopping"
              );
              break;
            }
          } else {
            noNewContentCount = 0;
            previousLength = articles.length;
          }
        }

        console.log(`Final article count: ${articles.length}`);
        return { title, articles };
      } catch (error) {
        console.error("Scraping error:", error);
        throw error;
      } finally {
        if (browser) {
          try {
            await browser.close();
          } catch (error) {
            console.error("Error closing browser:", error);
          }
        }
        this.removeLock(normalizedUrl);
      }
    })();

    this.setLock(normalizedUrl, scrapePromise);
    return scrapePromise;
  }

  private async extractArticles(page: Page): Promise<Article[]> {
    return await page.evaluate((contentSelectors: string[]) => {
      const articles: Array<{
        title: string;
        url: string;
        path: string;
        summary: string;
        date: string;
        firstSeen: string;
      }> = [];

      const processedUrls = new Set<string>();

      // Find all potential article containers
      const articleElements = document.querySelectorAll(
        'article, [class*="article"], [class*="post"], [role="article"]'
      );

      articleElements.forEach((article) => {
        try {
          // Find all links in the article
          const links = Array.from(
            article.querySelectorAll("a[href]")
          ) as HTMLAnchorElement[];

          // Find the main article link (usually the first or largest one)
          const mainLink = links.find((link) => {
            const href = link.href;
            // Skip common non-article links
            if (
              !href ||
              href === "#" ||
              href.startsWith("javascript:") ||
              processedUrls.has(href) ||
              /\/(tag|category|author|search|login|signup|register|about|contact|privacy|terms)/i.test(
                href
              ) ||
              href.includes("#") ||
              /\.(pdf|zip|rar|exe|dmg|apk)$/i.test(href)
            ) {
              return false;
            }
            return true;
          });

          if (!mainLink?.href) return;

          // Get the article title
          const titleEl =
            article.querySelector('h1, h2, h3, h4, [class*="title"]') ||
            mainLink.querySelector('h1, h2, h3, h4, [class*="title"]') ||
            mainLink;

          const titleText = titleEl?.textContent?.trim();

          // Get the article content/summary
          const contentEl =
            article.querySelector(
              'p, [class*="excerpt"], [class*="description"], [class*="summary"]'
            ) || article.querySelector('[class*="content"]');

          // Get the publication date
          const dateEl =
            article.querySelector("time") ||
            article.querySelector("[datetime]") ||
            article.querySelector('[class*="date"]');

          if (
            titleText &&
            titleText.length > 10 &&
            !/^\d+$/.test(titleText) &&
            !/^[@→]/.test(titleText)
          ) {
            processedUrls.add(mainLink.href);
            articles.push({
              title: titleText,
              url: mainLink.href,
              path: new URL(mainLink.href).pathname,
              summary: contentEl?.textContent?.trim() || "",
              date:
                dateEl?.getAttribute("datetime") ||
                dateEl?.textContent?.trim() ||
                new Date().toISOString(),
              firstSeen: new Date().toISOString(),
            });
          }
        } catch (e) {
          // Skip invalid entries
        }
      });

      // If no articles found with article elements, try content blocks
      if (articles.length === 0) {
        const contentBlocks = document.querySelectorAll(
          contentSelectors.join(", ")
        );

        contentBlocks.forEach((block) => {
          if (block.closest('nav, header, footer, aside, [role="navigation"]'))
            return;

          const links = block.querySelectorAll("a[href]");
          links.forEach((link: Element) => {
            const anchor = link as HTMLAnchorElement;
            const url = anchor.href;

            if (
              !url ||
              url === "#" ||
              url.startsWith("javascript:") ||
              processedUrls.has(url) ||
              /\/(tag|category|author|search|login|signup|register|about|contact|privacy|terms)/i.test(
                url
              ) ||
              url.includes("#") ||
              /\.(pdf|zip|rar|exe|dmg|apk)$/i.test(url)
            )
              return;

            try {
              const titleEl =
                anchor.querySelector('h1, h2, h3, h4, [class*="title"]') ||
                anchor.closest('h1, h2, h3, h4, [class*="title"]') ||
                anchor;

              const contentEl =
                anchor.closest('[class*="content"]')?.querySelector("p") ||
                anchor.closest("article")?.querySelector("p") ||
                anchor.parentElement?.querySelector("p");

              const dateEl =
                anchor.closest("article")?.querySelector("time") ||
                anchor.closest('[class*="content"]')?.querySelector("time") ||
                anchor.closest("article")?.querySelector('[class*="date"]');

              const titleText = titleEl?.textContent?.trim();

              if (
                titleText &&
                titleText.length > 10 &&
                !/^\d+$/.test(titleText) &&
                !/^[@→]/.test(titleText)
              ) {
                processedUrls.add(url);
                articles.push({
                  title: titleText,
                  url: url,
                  path: new URL(url).pathname,
                  summary: contentEl?.textContent?.trim() || "",
                  date:
                    dateEl?.getAttribute("datetime") ||
                    dateEl?.textContent?.trim() ||
                    new Date().toISOString(),
                  firstSeen: new Date().toISOString(),
                });
              }
            } catch (e) {
              // Skip invalid entries
            }
          });
        });
      }

      return articles;
    }, this.contentSelectors);
  }
}

export const dynamicScraper = new DynamicScraper();
