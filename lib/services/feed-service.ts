import Parser from "rss-parser";
import { Article } from "@/lib/types";
import axios from "axios";

// Define types for RSS feed items
interface CustomFeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  creator?: string;
  content?: string;
  contentSnippet?: string;
  guid?: string;
  isoDate?: string;
  media?: string;
  contentEncoded?: string;
}

interface CustomFeed {
  items: CustomFeedItem[];
  feedUrl?: string;
  title?: string;
  description?: string;
  link?: string;
  language?: string;
  lastBuildDate?: string;
}

export class FeedService {
  private parser: Parser<CustomFeed, CustomFeedItem>;

  constructor() {
    this.parser = new Parser({
      customFields: {
        item: [
          ["media:content", "media"],
          ["content:encoded", "contentEncoded"],
        ],
      },
    });
  }

  async detectFeed(url: string): Promise<string | null> {
    try {
      const baseUrl = new URL(url).origin;
      const feedUrls = [
        "/feed",
        "/rss",
        "/feed.xml",
        "/rss.xml",
        "/atom.xml",
        "/feed/atom",
      ];

      const config = {
        headers: {
          Accept:
            "application/rss+xml, application/xml, text/xml, application/atom+xml",
          "User-Agent": "Mozilla/5.0 (compatible; RSS Reader Bot/1.0)",
        },
        timeout: 5000,
      };

      // Try common feed URLs
      for (const feedPath of feedUrls) {
        const feedUrl = new URL(feedPath, baseUrl).href;
        try {
          const response = await axios.get(feedUrl, config);
          if (
            response.status === 200 &&
            (response.headers["content-type"]?.includes("xml") ||
              response.data?.includes("<rss") ||
              response.data?.includes("<feed"))
          ) {
            return feedUrl;
          }
        } catch {
          continue;
        }
      }

      // If no feed found, try parsing the page for feed links
      const response = await axios.get(url, config);
      const html = response.data;
      const feedLink = this.extractFeedLink(html);

      // Ensure the feed link is absolute
      if (feedLink) {
        return feedLink.startsWith("http")
          ? feedLink
          : new URL(feedLink, baseUrl).href;
      }

      return null;
    } catch (error) {
      console.error("Feed detection error:", error);
      return null;
    }
  }

  private extractFeedLink(html: string): string | null {
    // Extract feed URL from link tags
    const feedRegex =
      /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]*>/gi;
    const matches = html.match(feedRegex);

    if (matches) {
      const hrefRegex = /href=["']([^"']+)["']/i;
      for (const match of matches) {
        const href = match.match(hrefRegex)?.[1];
        if (href) return href;
      }
    }

    return null;
  }

  async getFeedArticles(xmlData: string): Promise<Article[]> {
    try {
      const feed = await this.parser.parseString(xmlData);

      return feed.items.map((item: CustomFeedItem) => {
        // More robust date handling
        let date = new Date().toISOString();
        try {
          if (item.isoDate) {
            const parsedDate = new Date(item.isoDate);
            if (!isNaN(parsedDate.getTime())) {
              date = parsedDate.toISOString();
            }
          } else if (item.pubDate) {
            // Handle various date formats
            const cleanDate = item.pubDate
              .replace(/[A-Za-z]{3,}, /g, "") // Remove day names
              .replace(/(\d{1,2})(st|nd|rd|th)/, "$1") // Remove ordinal suffixes
              .trim();

            const parsedDate = new Date(cleanDate);
            if (!isNaN(parsedDate.getTime())) {
              date = parsedDate.toISOString();
            }
          }
        } catch (error) {
          console.warn("Failed to parse date:", error);
          // Use current date as fallback
          date = new Date().toISOString();
        }

        // Ensure URL is absolute
        let url = item.link || "";
        try {
          if (url && !url.startsWith("http")) {
            url = new URL(url, feed.link || "").href;
          }
        } catch (error) {
          console.warn("Failed to parse URL:", error);
        }

        return {
          title: item.title?.substring(0, 255) || "Untitled", // Limit title length
          url: url,
          path: url ? new URL(url).pathname : "",
          summary: item.contentSnippet?.substring(0, 1000) || undefined, // Limit summary length
          date,
          firstSeen: new Date().toISOString(),
        };
      });
    } catch (error) {
      console.error("Feed parsing error:", error);
      return [];
    }
  }
}

export const feedService = new FeedService();
