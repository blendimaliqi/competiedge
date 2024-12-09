export interface MonitoringRule {
  id: string;
  website_id: string;
  type: "ARTICLE_COUNT" | "KEYWORD" | "SOCIAL_MENTIONS" | "CONTENT_CHANGE";
  threshold: number;
  keyword?: string;
  enabled: boolean;
  notify_email: string;
  last_triggered?: string;
  created_by?: string;
  created_at?: string;
}

export interface SocialMention {
  id: string;
  website_id: string;
  platform: "twitter" | "linkedin" | "facebook";
  content: string;
  url: string;
  engagement: {
    likes?: number;
    shares?: number;
    comments?: number;
  };
  created_at: string;
}
