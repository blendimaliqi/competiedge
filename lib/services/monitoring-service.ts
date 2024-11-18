import { supabase } from "@/lib/supabase";
import { MonitoringRule, SocialMention } from "@/lib/types/monitoring";
import { Resend } from "resend";

export class MonitoringService {
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  private async sendEmail(to: string, subject: string, content: string) {
    if (!process.env.RESEND_API_KEY) {
      console.log(`[DEV] Email to ${to}: ${subject}\n${content}`);
      return;
    }

    try {
      await this.resend.emails.send({
        from: "CompetieEdge <onboarding@resend.dev>", // Default sender during testing
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
    } catch (error) {
      console.error("Failed to send email:", error);
    }
  }

  async checkArticleCountRule(rule: MonitoringRule) {
    const { data: website } = await supabase
      .from("websites")
      .select("article_count")
      .eq("id", rule.websiteId)
      .single();

    if (website && website.article_count >= rule.threshold) {
      await this.sendEmail(
        rule.notifyEmail,
        "Article Count Threshold Reached",
        `Website ${rule.websiteId} has reached ${website.article_count} articles`
      );

      // Update last triggered time
      await supabase
        .from("monitoring_rules")
        .update({ last_triggered: new Date().toISOString() })
        .eq("id", rule.id);
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
