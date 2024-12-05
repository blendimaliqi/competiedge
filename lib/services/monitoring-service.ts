import { supabase } from "@/lib/supabase";
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
      return;
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
            <p>${content}</p>
            <hr>
            <p style="color: #666; font-size: 12px;">
              This is an automated alert from CompetieEdge
            </p>
          </div>
        `,
      });
      console.log("Email sent successfully:", data);
      return data;
    } catch (error) {
      console.error("Failed to send email:", error);
      throw error; // Re-throw to handle in the calling function
    }
  }

  async sendNotification(to: string, websiteUrl: string, newLinks: string[]) {
    return this.sendEmail(
      to,
      `${newLinks.length} New Link${newLinks.length === 1 ? "" : "s"} Found`,
      `New links found on ${websiteUrl}:\n\n${newLinks
        .map((link: string) => `- ${link}`)
        .join("\n")}`
    );
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
      const { data: website } = await supabase
        .from("websites")
        .select("url")
        .eq("id", rule.websiteId)
        .single();

      if (!website?.url) {
        console.error("Website not found");
        return;
      }

      // Get the previous content analysis
      const { data: previousAnalysis } = await supabase
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
      const { data: newSnapshot, error: snapshotError } = await supabase
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

        await supabase
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
    const { data: rules } = await supabase
      .from("monitoring_rules")
      .select("*")
      .eq("enabled", true)
      .eq("type", "CONTENT_CHANGE");

    if (!rules) return;

    for (const rule of rules) {
      await this.checkContentChangeRule(rule);
    }
  }
}

export const monitoringService = new MonitoringService();
