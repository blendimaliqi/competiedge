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

  async checkAllRules() {
    const { data: rules } = await supabase
      .from("monitoring_rules")
      .select("*")
      .eq("enabled", true);

    if (!rules) return;

    for (const rule of rules) {
      switch (rule.type) {
        case "ARTICLE_COUNT":
          await this.checkArticleCountRule(rule);
          break;
        case "KEYWORD":
          await this.checkKeywordRule(rule);
          break;
        // Add more rule types as needed
      }
    }
  }
}

export const monitoringService = new MonitoringService();
