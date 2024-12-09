import { supabase, supabaseAdmin } from "@/lib/supabase";
import { MonitoringRule, SocialMention } from "@/lib/types/monitoring";
import { Resend } from "resend";

export class MonitoringService {
  private resend: Resend;

  constructor() {
    console.log(
      "Initializing Resend with API key:",
      process.env.RESEND_API_KEY?.substring(0, 5) + "..."
    );
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  private async sendEmail(to: string, subject: string, content: string) {
    if (!process.env.RESEND_API_KEY) {
      console.error("No Resend API key found!");
      throw new Error("Email service not configured - missing API key");
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

  async sendNotification(to: string, websiteUrl: string, newLinks: string[]) {
    console.log("Starting sendNotification with:", {
      to,
      websiteUrl,
      newLinksCount: newLinks.length,
      resendApiKey: process.env.RESEND_API_KEY ? "Set" : "Not set",
    });

    if (!process.env.RESEND_API_KEY) {
      console.error(
        "RESEND_API_KEY is not set! Cannot send email notification."
      );
      throw new Error("Email service not configured - missing RESEND_API_KEY");
    }

    if (newLinks.length === 0) {
      console.log("No new links to notify about, skipping email");
      return;
    }

    const formattedLinks = newLinks
      .map((link) => `• <a href="${link}">${link}</a>`)
      .join("<br>");

    console.log("Attempting to send email notification...");

    try {
      const result = await this.sendEmail(
        to,
        `${newLinks.length} New Link${
          newLinks.length === 1 ? "" : "s"
        } Found on ${websiteUrl}`,
        `
          New links have been detected on ${websiteUrl}:<br><br>
          ${formattedLinks}
        `
      );
      console.log("Email notification sent successfully:", result);
      return result;
    } catch (error) {
      console.error("Failed to send email notification:", error);
      throw error;
    }
  }

  async checkArticleCountRule(rule: MonitoringRule) {
    try {
      console.log("Checking article count rule:", rule);

      // For test emails, skip the website check
      if (rule.websiteId === "test") {
        await this.sendEmail(
          rule.notifyEmail,
          "Test Email from CompetieEdge",
          "This is a test email to verify your monitoring setup is working correctly."
        );
        return;
      }

      const { data: website } = await supabase
        .from("websites")
        .select("article_count")
        .eq("id", rule.websiteId)
        .single();

      console.log("Website data:", website);

      if (website && website.article_count >= rule.threshold) {
        await this.sendEmail(
          rule.notifyEmail,
          "Article Count Threshold Reached",
          `Website ${rule.websiteId} has reached ${website.article_count} articles`
        );

        await supabase
          .from("monitoring_rules")
          .update({ last_triggered: new Date().toISOString() })
          .eq("id", rule.id);
      }
    } catch (error) {
      console.error("Error in checkArticleCountRule:", error);
      throw error;
    }
  }

  async checkKeywordRule(rule: MonitoringRule) {
    if (!rule.keyword) return;

    const { data: articles } = await supabase
      .from("articles")
      .select("*")
      .eq("website_id", rule.websiteId)
      .ilike("title", `%${rule.keyword}%`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (articles && articles.length > 0) {
      const lastArticle = articles[0];
      await this.sendEmail(
        rule.notifyEmail,
        `Keyword "${rule.keyword}" Detected`,
        `New article containing "${rule.keyword}" found: ${lastArticle.title}`
      );

      await supabase
        .from("monitoring_rules")
        .update({ last_triggered: new Date().toISOString() })
        .eq("id", rule.id);
    }
  }

  async checkContentChangeRule(rule: MonitoringRule) {
    try {
      console.log("Checking content change rule:", rule);

      // Get the website URL
      const { data: website } = await (supabaseAdmin || supabase)
        .from("websites")
        .select("url")
        .eq("id", rule.websiteId)
        .single();

      if (!website?.url) {
        console.error("Website not found");
        return;
      }

      // Get the previous content analysis
      const { data: previousAnalysis } = await (supabaseAdmin || supabase)
        .from("content_snapshots")
        .select("*")
        .eq("website_id", rule.websiteId)
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
          website_id: rule.websiteId,
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
      const newLinks = currentMetrics.links.filter(
        (link: string) => !previousLinks.includes(link)
      );

      // If new links found, send notification
      if (newLinks.length > 0) {
        await this.sendNotification(rule.notifyEmail, website.url, newLinks);

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
      console.error("Failed to resume monitoring:", error);
      throw error;
    }
  }

  async stopMonitoring(websiteId: string, userId: string) {
    try {
      const { data, error } = await supabase
        .from("monitoring_rules")
        .update({ enabled: false })
        .eq("website_id", websiteId);

      if (error) {
        console.error("Error stopping monitoring:", error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error("Failed to stop monitoring:", error);
      throw error;
    }
  }
}

export const monitoringService = new MonitoringService();
