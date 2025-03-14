import { supabase, supabaseAdmin } from "@/lib/supabase";
import { MonitoringRule, SocialMention } from "@/lib/types/monitoring";
import { Resend } from "resend";
import { Article } from "@/lib/types";

function normalizeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    // Remove UTM parameters and other tracking parameters
    const searchParams = new URLSearchParams(parsedUrl.search);
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "dre",
      "referer",
      "vgfront",
    ].forEach((param) => {
      searchParams.delete(param);
    });

    // Remove fragment
    parsedUrl.hash = "";

    // Update search params
    parsedUrl.search = searchParams.toString();

    return parsedUrl.toString();
  } catch {
    return url;
  }
}

export class MonitoringService {
  private resend: Resend | null = null;
  private notificationCache: Map<string, number> = new Map();
  private NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    if (!process.env.RESEND_API_KEY) {
      console.warn(
        "RESEND_API_KEY not set - email notifications will be disabled"
      );
    } else {
      console.log(
        "Initializing Resend with API key:",
        process.env.RESEND_API_KEY?.substring(0, 5) + "..."
      );
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }

    // Start periodic cache cleanup
    this.cleanupInterval = setInterval(() => {
      this.cleanupNotificationCache();
    }, this.NOTIFICATION_COOLDOWN_MS);
  }

  private cleanupNotificationCache(): void {
    const now = Date.now();
    // Convert Map entries to array to avoid TypeScript iteration issues
    Array.from(this.notificationCache.entries()).forEach(([key, timestamp]) => {
      if (now - timestamp > this.NOTIFICATION_COOLDOWN_MS) {
        this.notificationCache.delete(key);
      }
    });
  }

  // Clean up interval on service destruction
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  private getCacheKey(
    email: string,
    websiteUrl: string,
    links: string[]
  ): string {
    // Normalize URLs in the cache key to prevent duplicates due to trailing slashes, etc.
    const normalizedUrl = websiteUrl.replace(/\/+$/, "");
    const normalizedLinks = links
      .map((link) => link.replace(/\/+$/, ""))
      .sort();
    return `${email}:${normalizedUrl}:${normalizedLinks.join(",")}`;
  }

  private canSendNotification(
    email: string,
    websiteUrl: string,
    links: string[]
  ): boolean {
    const cacheKey = this.getCacheKey(email, websiteUrl, links);
    const lastSentTime = this.notificationCache.get(cacheKey);

    if (!lastSentTime) return true;

    const timeSinceLastNotification = Date.now() - lastSentTime;
    return timeSinceLastNotification > this.NOTIFICATION_COOLDOWN_MS;
  }

  private updateNotificationCache(
    email: string,
    websiteUrl: string,
    links: string[]
  ): void {
    const cacheKey = this.getCacheKey(email, websiteUrl, links);
    this.notificationCache.set(cacheKey, Date.now());
  }

  private async sendEmail(to: string, subject: string, content: string) {
    if (!this.resend) {
      console.error("No Resend client available");
      throw new Error("Email service not configured");
    }

    try {
      console.log("Attempting to send email:", { to, subject });
      const data = await this.resend.emails.send({
        from: "CompetieEdge <onboarding@resend.dev>",
        to: [to],
        subject,
        html: `
          <div style="font-family: sans-serif; padding: 20px;">
            <h2>${subject}</h2>
            <div style="margin: 20px 0;">
              ${content
                .split("\n")
                .map((line) => `<p>${line}</p>`)
                .join("")}
            </div>
            <hr>
            <p style="color: #666; font-size: 12px;">
              This is an automated alert from CompetieEdge. 
              If you wish to stop receiving these notifications, use the stop monitoring button in the dashboard.
            </p>
          </div>
        `,
      });
      console.log("Email sent successfully:", data);
      return data;
    } catch (error) {
      console.error("Failed to send email:", error);
      throw error;
    }
  }

  async handleWebsiteUpdate(
    websiteId: string,
    newArticles: Article[]
  ): Promise<void> {
    console.log(
      `Handling update for website ${websiteId} with ${newArticles.length} new articles`
    );

    try {
      // Get website details with monitoring rules
      const { data: website, error: websiteError } = await supabase
        .from("websites")
        .select(
          `
          *,
          monitoring_rules (
            id,
            enabled,
            type,
            notify_email,
            threshold,
            keyword
          )
        `
        )
        .eq("id", websiteId)
        .single();

      if (websiteError) {
        console.error("Error fetching website details:", websiteError);
        throw new Error("Failed to fetch website details");
      }

      if (!website) {
        console.error("Website not found:", websiteId);
        return;
      }

      // Get active monitoring rules
      const activeRules = (
        website.monitoring_rules as MonitoringRule[]
      )?.filter((rule) => rule.enabled);

      if (!activeRules?.length) {
        console.log("No active monitoring rules found");
        return;
      }

      console.log(`Found ${activeRules.length} active monitoring rules`);

      // Process each rule
      for (const rule of activeRules) {
        try {
          switch (rule.type) {
            case "ARTICLE_COUNT":
              if (newArticles.length >= rule.threshold) {
                await this.sendNotification(
                  rule.notify_email,
                  website.url,
                  newArticles.map((a) => a.url)
                );
              }
              break;

            case "KEYWORD":
              if (rule.keyword) {
                const matchingArticles = newArticles.filter(
                  (article) =>
                    article.title
                      .toLowerCase()
                      .includes(rule.keyword!.toLowerCase()) ||
                    (article.summary &&
                      article.summary
                        .toLowerCase()
                        .includes(rule.keyword!.toLowerCase()))
                );

                if (matchingArticles.length > 0) {
                  await this.sendNotification(
                    rule.notify_email,
                    website.url,
                    matchingArticles.map((a) => a.url)
                  );
                }
              }
              break;

            case "CONTENT_CHANGE":
              // Content change is already handled by the threshold
              if (newArticles.length > 0) {
                await this.sendNotification(
                  rule.notify_email,
                  website.url,
                  newArticles.map((a) => a.url)
                );
              }
              break;

            default:
              console.log(`Unsupported rule type: ${rule.type}`);
          }

          // Update rule's last triggered timestamp
          await supabase
            .from("monitoring_rules")
            .update({ last_triggered: new Date().toISOString() })
            .eq("id", rule.id);
        } catch (error) {
          console.error(`Error processing rule ${rule.id}:`, error);
        }
      }
    } catch (error) {
      console.error("Error handling website update:", error);
      throw error;
    }
  }

  async sendNotification(to: string, websiteUrl: string, newLinks: string[]) {
    console.log("Starting sendNotification with:", {
      to,
      websiteUrl,
      newLinksCount: newLinks.length,
      resendApiKey: process.env.RESEND_API_KEY ? "Set" : "Not set",
    });

    if (!this.canSendNotification(to, websiteUrl, newLinks)) {
      console.log("Skipping duplicate notification within cooldown period");
      return;
    }

    if (!this.resend) {
      console.warn("Email service not configured - skipping notification");
      return;
    }

    if (newLinks.length === 0) {
      console.log("No new links to notify about, skipping email");
      return;
    }

    // Normalize links to prevent duplicates
    const normalizedLinks = Array.from(new Set(newLinks.map(normalizeUrl)));

    const formattedLinks = normalizedLinks
      .map((link) => {
        const titleMatch = link.match(/\/([^\/]+)$/);
        const title = titleMatch
          ? titleMatch[1]
              .replace(/-/g, " ")
              .replace(/[0-9a-f]{32}$/, "")
              .trim()
          : "New Article";
        const detectionTime = new Date().toLocaleString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          day: "numeric",
          month: "long",
          year: "numeric",
        });

        return `
          <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 5px; background: #fff;">
            <h3 style="margin: 0 0 10px 0; color: #0070f3;">${title}</h3>
            <p style="margin: 5px 0; color: #666;">Detected: ${detectionTime}</p>
            <p style="margin: 5px 0; color: #666;">URL: ${link}</p>
            <p style="margin: 10px 0;">
              <a href="${link}" style="background: #0070f3; color: white; padding: 8px 15px; text-decoration: none; border-radius: 5px; display: inline-block;">View Article</a>
            </p>
          </div>
        `;
      })
      .join("");

    try {
      const result = await this.sendEmail(
        to,
        `New Content Alert: ${websiteUrl}`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
            <h2 style="color: #333; border-bottom: 2px solid #0070f3; padding-bottom: 10px; margin-top: 0;">
              Content Update for ${websiteUrl}
            </h2>
            <p style="color: #666; margin: 15px 0;">
              We've detected ${normalizedLinks.length} new article${
          normalizedLinks.length === 1 ? "" : "s"
        }:
            </p>
            ${formattedLinks}
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #666; font-size: 12px;">
                This is an automated notification from CompetieEdge. 
                You can manage your monitoring settings in the dashboard.
              </p>
            </div>
          </div>
        `
      );

      // Update cache after successful send
      this.updateNotificationCache(to, websiteUrl, normalizedLinks);

      return result;
    } catch (error) {
      console.error("Failed to send email notification:", error);
      // Don't throw here to prevent breaking the monitoring flow
      // Just log the error and continue
    }
  }

  async checkArticleCountRule(rule: MonitoringRule) {
    try {
      console.log("Checking article count rule:", rule);

      // For test emails, skip the website check
      if (rule.website_id === "test") {
        await this.sendEmail(
          rule.notify_email,
          "Test Email from CompetieEdge",
          "This is a test email to verify your monitoring setup is working correctly."
        );
        return;
      }

      const { data: website, error: websiteError } = await supabase
        .from("websites")
        .select("article_count")
        .eq("id", rule.website_id)
        .single();

      if (websiteError) {
        console.error("Error fetching website:", websiteError);
        throw websiteError;
      }

      console.log("Website data:", website);

      if (website && website.article_count >= rule.threshold) {
        await this.sendEmail(
          rule.notify_email,
          "Article Count Threshold Reached",
          `Website ${rule.website_id} has reached ${website.article_count} articles`
        );

        const { error: updateError } = await supabase
          .from("monitoring_rules")
          .update({ last_triggered: new Date().toISOString() })
          .eq("id", rule.id);

        if (updateError) {
          console.error("Error updating rule last_triggered:", updateError);
          throw updateError;
        }
      }
    } catch (error) {
      console.error("Error in checkArticleCountRule:", error);
      throw error;
    }
  }

  async checkKeywordRule(rule: MonitoringRule) {
    try {
      if (!rule.keyword) return;

      const { data: articles, error: articlesError } = await supabase
        .from("articles")
        .select("*")
        .eq("website_id", rule.website_id)
        .ilike("title", `%${rule.keyword}%`)
        .order("created_at", { ascending: false })
        .limit(1);

      if (articlesError) {
        console.error("Error fetching articles:", articlesError);
        throw articlesError;
      }

      if (articles && articles.length > 0) {
        const lastArticle = articles[0];
        await this.sendEmail(
          rule.notify_email,
          `Keyword "${rule.keyword}" Detected`,
          `New article containing "${rule.keyword}" found: ${lastArticle.title}`
        );

        const { error: updateError } = await supabase
          .from("monitoring_rules")
          .update({ last_triggered: new Date().toISOString() })
          .eq("id", rule.id);

        if (updateError) {
          console.error("Error updating rule last_triggered:", updateError);
          throw updateError;
        }
      }
    } catch (error) {
      console.error("Error in checkKeywordRule:", error);
      throw error;
    }
  }

  async checkContentChangeRule(rule: MonitoringRule) {
    try {
      console.log("Checking content change rule:", rule);

      // Get the website URL
      const { data: website } = await (supabaseAdmin || supabase)
        .from("websites")
        .select("url")
        .eq("id", rule.website_id)
        .single();

      if (!website?.url) {
        console.error("Website not found");
        return;
      }

      // Get the previous content analysis
      const { data: previousAnalysis } = await (supabaseAdmin || supabase)
        .from("content_snapshots")
        .select("*")
        .eq("website_id", rule.website_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      // Get current content analysis
      const response = await fetch(
        process.env.NEXT_PUBLIC_APP_URL + "/api/analyze-content",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: website.url }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to analyze content");
      }

      const { metrics: currentMetrics } = await response.json();

      // Store the new snapshot
      const { data: newSnapshot, error: snapshotError } = await (
        supabaseAdmin || supabase
      )
        .from("content_snapshots")
        .insert({
          website_id: rule.website_id,
          metrics: currentMetrics,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (snapshotError) {
        console.error("Error storing snapshot:", snapshotError);
        return;
      }

      // If there's no previous analysis, we can't compare
      if (!previousAnalysis) {
        console.log("No previous analysis to compare against");
        return;
      }

      // Check for new links
      const previousLinks = previousAnalysis.metrics.links || [];
      const normalizedPreviousLinks = previousLinks.map(normalizeUrl);
      const normalizedCurrentLinks = currentMetrics.links.map(normalizeUrl);

      const newLinks = normalizedCurrentLinks.filter(
        (link: string) => !normalizedPreviousLinks.includes(link)
      );

      // If new links found, send notification
      if (newLinks.length > 0) {
        await this.sendNotification(rule.notify_email, website.url, newLinks);

        await (supabaseAdmin || supabase)
          .from("monitoring_rules")
          .update({ last_triggered: new Date().toISOString() })
          .eq("id", rule.id);
      }
    } catch (error) {
      console.error("Error in checkContentChangeRule:", error);
      throw error;
    }
  }

  async checkAllRules() {
    // Check if monitoring is enabled
    const { data: settings } = await (supabaseAdmin || supabase)
      .from("system_settings")
      .select("value")
      .eq("key", "monitoring_status")
      .single();

    if (!settings?.value.enabled) {
      console.log("Monitoring is currently paused");
      return;
    }

    const { data: rules } = await (supabaseAdmin || supabase)
      .from("monitoring_rules")
      .select("*")
      .eq("enabled", true)
      .eq("type", "CONTENT_CHANGE");

    if (!rules) return;

    for (const rule of rules) {
      await this.checkContentChangeRule(rule);
    }
  }

  async getMonitoringStatus() {
    try {
      // First try to get the status
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "monitoring_status")
        .single();

      if (error) {
        console.error("Error getting monitoring status:", error);
        // Try to initialize if there's an error
        await this.initializeMonitoringStatus();

        // Try to get the status again
        const { data: retryData, error: retryError } = await supabase
          .from("system_settings")
          .select("value")
          .eq("key", "monitoring_status")
          .single();

        if (retryError) {
          console.error(
            "Error getting monitoring status after initialization:",
            retryError
          );
          return { enabled: true }; // Default state
        }

        return retryData.value;
      }

      return data.value;
    } catch (error) {
      console.error("Failed to get monitoring status:", error);
      // Return a default state instead of throwing
      return { enabled: true };
    }
  }

  private async initializeMonitoringStatus() {
    try {
      // First, try to call the stored procedure to create the table if it doesn't exist
      const { error: procError } = await supabase.rpc(
        "create_system_settings_if_not_exists"
      );

      if (procError) {
        console.error(
          "Error calling create_system_settings_if_not_exists:",
          procError
        );
        throw procError;
      }

      // Check if we already have a monitoring status
      const { data: existingStatus } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "monitoring_status")
        .single();

      if (!existingStatus) {
        // Insert initial status if it doesn't exist
        const { error: insertError } = await supabase
          .from("system_settings")
          .insert({
            key: "monitoring_status",
            value: { enabled: true, paused_at: null, paused_by: null },
          });

        if (insertError) {
          console.error("Error initializing monitoring status:", insertError);
          throw insertError;
        }
      }

      console.log("Successfully initialized monitoring status");
    } catch (error) {
      console.error("Failed to initialize monitoring status:", error);
      throw error;
    }
  }

  async pauseMonitoring(userId: string) {
    try {
      // Ensure the status exists first
      await this.getMonitoringStatus();

      const { data, error } = await supabase
        .from("system_settings")
        .update({
          value: {
            enabled: false,
            paused_at: new Date().toISOString(),
            paused_by: userId,
          },
          updated_by: userId,
        })
        .eq("key", "monitoring_status")
        .select()
        .single();

      if (error) {
        console.error("Error pausing monitoring:", error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Failed to pause monitoring:", error);
      throw error;
    }
  }

  async resumeMonitoring(userId: string) {
    try {
      // Ensure the status exists first
      await this.getMonitoringStatus();

      const { data, error } = await supabase
        .from("system_settings")
        .update({
          value: {
            enabled: true,
            paused_at: null,
            paused_by: null,
          },
          updated_by: userId,
        })
        .eq("key", "monitoring_status")
        .select()
        .single();

      if (error) {
        console.error("Error resuming monitoring:", error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Failed to resume monitoring s:", error);
      throw error;
    }
  }

  private async processBatch(
    websiteId: string,
    userId: string,
    ruleIds: string[],
    batchSize: number = 50
  ) {
    const batches = [];
    for (let i = 0; i < ruleIds.length; i += batchSize) {
      batches.push(ruleIds.slice(i, i + batchSize));
    }

    let successCount = 0;
    const failedRules: string[] = [];

    for (const batch of batches) {
      try {
        const { error } = await supabase.rpc("disable_monitoring_rules", {
          p_website_id: websiteId,
          p_user_id: userId,
          p_rule_ids: batch,
        });

        if (error) {
          console.error("Error processing batch:", {
            batchSize: batch.length,
            error: error.message,
          });
          failedRules.push(...batch);
        } else {
          successCount += batch.length;
        }
      } catch (error) {
        console.error("Batch processing error:", error);
        failedRules.push(...batch);
      }
    }

    return { successCount, failedRules };
  }

  async stopMonitoring(websiteId: string, userId: string) {
    try {
      console.log("Attempting to stop monitoring:", { websiteId, userId });

      // Get monitoring rules for this website and user
      const { data: rules, error: fetchError } = await supabase
        .from("monitoring_rules")
        .select("id")
        .eq("website_id", websiteId)
        .eq("created_by", userId)
        .eq("enabled", true);

      if (fetchError) {
        console.error("Error fetching rules:", fetchError);
        throw new Error(`Failed to fetch rules: ${fetchError.message}`);
      }

      if (!rules || rules.length === 0) {
        console.log("No rules found to disable");
        return { successCount: 0, failedRules: [] };
      }

      const ids = rules.map((r) => r.id);
      console.log(`Processing ${ids.length} rules in batches`);

      // Process rules in batches
      const result = await this.processBatch(websiteId, userId, ids);

      // Log summary instead of full objects
      console.log("Batch processing complete:", {
        totalRules: ids.length,
        successCount: result.successCount,
        failedCount: result.failedRules.length,
      });

      if (result.failedRules.length > 0) {
        throw new Error(`Failed to disable ${result.failedRules.length} rules`);
      }

      return result;
    } catch (error: any) {
      console.error("Error in stopMonitoring:", error);
      throw error;
    }
  }
}

export const monitoringService = new MonitoringService();
