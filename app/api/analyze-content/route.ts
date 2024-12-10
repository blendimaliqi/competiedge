import { NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chrome from "@sparticuz/chromium";

export async function POST(request: Request) {
  try {
    const { url: targetUrl } = await request.json();
    console.log("Analyzing content for URL:", targetUrl);

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

      console.log("Navigating to URL:", targetUrl);
      await page.goto(targetUrl, {
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

        const headings = Array.from(
          document.querySelectorAll("h1, h2, h3")
        ).map((el) => el.textContent?.trim() || "");

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
          .filter(Boolean);

        return {
          wordCount,
          headings,
          links,
        };
      }, targetUrl);

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
          .filter(Boolean);
      }, targetUrl);

      metrics.links = [...new Set([...metrics.links, ...newLinks])];

      await browser.close();
      return NextResponse.json({ metrics });
    } catch (error) {
      if (browser) await browser.close();
      throw error;
    }
  } catch (error) {
    console.error("Error analyzing content:", error);
    return NextResponse.json(
      { error: "Failed to analyze content" },
      { status: 500 }
    );
  }
}
