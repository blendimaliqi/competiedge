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

      console.log("Navigating to URL:", targetUrl);
      await page.goto(targetUrl, {
        waitUntil: "networkidle0",
        timeout: 30000,
      });

      // Wait for any content to load
      await page.waitForSelector(
        'article, [class*="article"], [class*="post"], h1, h2, h3',
        { timeout: 30000 }
      );

      // Extract metrics
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

      // Scroll and look for more content
      let previousLength = metrics.links.length;
      let noNewContentCount = 0;
      const maxScrollAttempts = 5;

      for (let i = 0; i < maxScrollAttempts; i++) {
        console.log(`Scroll attempt ${i + 1}/${maxScrollAttempts}`);

        await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
        });

        // Use the same waiting approach as manual scraping
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

        const newMetrics = await page.evaluate((url) => {
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

          return { links };
        }, targetUrl);

        if (newMetrics.links.length === previousLength) {
          noNewContentCount++;
          if (noNewContentCount >= 2) {
            console.log(
              "No new content found after multiple scrolls, stopping"
            );
            break;
          }
        } else {
          noNewContentCount = 0;
          previousLength = newMetrics.links.length;
          metrics.links = newMetrics.links;
        }
      }

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
