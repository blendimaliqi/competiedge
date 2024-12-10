import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import * as cheerio from "cheerio";
import axios from "axios";
import puppeteer from "puppeteer-core";
import chrome from "@sparticuz/chromium";

const CRON_SECRET = process.env.CRON_SECRET;

// Helper function to check if a URL is likely an article
function isArticleUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const path = parsedUrl.pathname.toLowerCase();

    // Skip common non-article paths
    if (
      path === "/" ||
      path.includes("/tag/") ||
      path.includes("/category/") ||
      path.includes("/author/") ||
      path.includes("/search") ||
      path.includes("/login") ||
      path.includes("/signup") ||
      path.includes("/register") ||
      path.includes("/about") ||
      path.includes("/contact") ||
      path.includes("/privacy") ||
      path.includes("/terms") ||
      path.includes("/feed") ||
      path.includes("/rss") ||
      path.includes("/sitemap") ||
      path.includes("/wp-") ||
      path.includes("/page/") ||
      path.includes("/comment") ||
      path.includes("/trackback") ||
      path.includes("/cdn-cgi/") ||
      path.match(/\.(jpg|jpeg|png|gif|css|js|xml|txt)$/)
    ) {
      return false;
    }

    // Check for article indicators
    const articleIndicators = [
      "/article/",
      "/post/",
      "/story/",
      "/news/",
      "/blog/",
      "/read/",
      "/watch/",
      "/video/",
      "/p/",
      "/entry/",
    ];

    if (articleIndicators.some((indicator) => path.includes(indicator))) {
      return true;
    }

    // Check if path has a reasonable structure for an article
    // e.g., /2023/12/article-title or /section/article-title
    const segments = path.split("/").filter(Boolean);
    if (
      segments.length >= 2 &&
      segments[segments.length - 1].length > 10 &&
      !segments[segments.length - 1].includes("=")
    ) {
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
}

async function analyzeContent(url: string) {
  // First try with Cheerio (fast)
  try {
    const response = await axios.get(url, {
      timeout: 5000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    const $ = cheerio.load(response.data);
    const metrics = {
      wordCount: $("body")
        .text()
        .split(/\s+/)
        .filter((word) => word.length > 0).length,
      headings: $("h1, h2, h3")
        .map((_, el) => $(el).text().trim())
        .get(),
      links: $("a[href]")
        .map((_, el) => {
          const href = $(el).attr("href");
          if (!href || href === "#" || href.startsWith("javascript:"))
            return null;
          try {
            return new URL(href, url).href;
          } catch {
            return null;
          }
        })
        .get()
        .filter(Boolean),
    };

    // Check if the page might be dynamic
    const hasDynamicIndicators =
      $("[data-react-root]").length > 0 ||
      $("#__next").length > 0 ||
      $("#app").length > 0 ||
      $('script[src*="react"]').length > 0 ||
      $('script[src*="vue"]').length > 0 ||
      $('script[src*="angular"]').length > 0;

    if (!hasDynamicIndicators) {
      return metrics;
    }

    // If dynamic indicators found, fallback to Puppeteer
    console.log("Dynamic content detected, using Puppeteer");
  } catch (error) {
    console.log("Cheerio attempt failed, falling back to Puppeteer");
  }

  // Fallback to Puppeteer for dynamic content
  let browser;
  try {
    let executablePath: string;
    let args: string[];

    if (process.env.AWS_LAMBDA_FUNCTION_VERSION) {
      executablePath = await chrome.executablePath();
      args = [...chrome.args, "--single-process"];
    } else {
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
        "--single-process",
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

    page.setDefaultNavigationTimeout(5000);
    page.setDefaultTimeout(5000);

    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const resourceType = request.resourceType();
      if (
        resourceType === "image" ||
        resourceType === "stylesheet" ||
        resourceType === "font"
      ) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 5000,
    });

    await Promise.race([
      page.waitForSelector(
        'article, [class*="article"], [class*="post"], h1, h2, h3',
        { timeout: 3000 }
      ),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);

    const metrics = await page.evaluate((url) => {
      const wordCount = document.body.innerText
        .split(/\s+/)
        .filter((word) => word.length > 0).length;

      const headings = Array.from(document.querySelectorAll("h1, h2, h3")).map(
        (el) => el.textContent?.trim() || ""
      );

      const links = Array.from(document.querySelectorAll("a[href]"))
        .map((el) => {
          const href = el.getAttribute("href");
          if (!href || href === "#" || href.startsWith("javascript:"))
            return null;
          try {
            return new URL(href, url).href;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as string[];

      return {
        wordCount,
        headings,
        links,
      };
    }, url);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 1000))
    );

    const newLinks = await page.evaluate((url) => {
      return Array.from(document.querySelectorAll("a[href]"))
        .map((el) => {
          const href = el.getAttribute("href");
          if (!href || href === "#" || href.startsWith("javascript:"))
            return null;
          try {
            return new URL(href, url).href;
          } catch {
            return null;
          }
        })
        .filter(Boolean) as string[];
    }, url);

    metrics.links = Array.from(new Set(metrics.links.concat(newLinks)));

    await browser.close();
    return metrics;
  } catch (error) {
    if (browser) await browser.close();
    throw error;
  }
}

export async function GET(request: Request, context: any) {
  try {
    const websiteId = context.params.id;
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get("secret");
    const authHeader = request.headers.get("authorization");
    const serviceRoleKey = authHeader?.replace("Bearer ", "");

    console.log("Update endpoint called:", {
      websiteId,
      hasSecret: !!secret,
      hasCronSecret: !!CRON_SECRET,
      secretMatch: secret === CRON_SECRET,
      hasServiceRoleKey: !!serviceRoleKey,
    });

    if (!CRON_SECRET) {
      console.error("CRON_SECRET is not set in environment variables");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    if (secret !== CRON_SECRET) {
      console.error("Secret mismatch");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      !serviceRoleKey ||
      serviceRoleKey !== process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      console.error("Invalid service role key");
      return NextResponse.json(
        { error: "Unauthorized - Invalid service role key" },
        { status: 401 }
      );
    }

    // Use admin client for cron jobs
    const client = supabaseAdmin || supabase;

    // Update website last_checked timestamp
    const { data: updatedWebsite, error: updateError } = await client
      .from("websites")
      .update({ last_checked: new Date().toISOString() })
      .eq("id", websiteId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating website:", updateError);
      return NextResponse.json(
        { error: "Failed to update website" },
        { status: 500 }
      );
    }

    // Get website URL for content analysis
    const { data: website } = await client
      .from("websites")
      .select("url")
      .eq("id", websiteId)
      .single();

    if (!website?.url) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    // Get existing articles
    const { data: existingArticles } = await client
      .from("articles")
      .select("url")
      .eq("website_id", websiteId);

    const existingUrls = new Set(
      existingArticles?.map((article) => article.url) || []
    );

    // Analyze content directly
    const currentMetrics = await analyzeContent(website.url);
    const currentLinks = (currentMetrics.links || []).filter(isArticleUrl);

    // Find new links by comparing with existing articles
    const newLinks = currentLinks.filter(
      (link: any) => !existingUrls.has(link)
    );
    console.log("Found new article links:", newLinks.length);

    // Store new articles
    if (newLinks.length > 0) {
      const { error: articlesError } = await client.from("articles").insert(
        newLinks.map((url: string) => ({
          website_id: websiteId,
          url,
          title: url, // You might want to fetch the actual title
          path: new URL(url).pathname,
          first_seen: new Date().toISOString(),
        }))
      );

      if (articlesError) {
        console.error("Error storing new articles:", articlesError);
        return NextResponse.json({
          website: updatedWebsite,
          message: "Update completed but failed to store new articles",
          error: articlesError.message,
        });
      }

      // Update article count
      const { error: countError } = await client
        .from("websites")
        .update({
          article_count: (existingArticles?.length || 0) + newLinks.length,
        })
        .eq("id", websiteId);

      if (countError) {
        console.error("Error updating article count:", countError);
      }
    }

    return NextResponse.json({
      website: updatedWebsite,
      message: "Update completed successfully",
      newLinks,
    });
  } catch (error) {
    console.error("Error in website update:", error);
    return NextResponse.json(
      { error: "Failed to update website" },
      { status: 500 }
    );
  }
}
