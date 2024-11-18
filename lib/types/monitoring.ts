export interface MonitoringRule {
  id: string;
  websiteId: string;
  type: "ARTICLE_COUNT" | "KEYWORD" | "SOCIAL_MENTIONS" | "CONTENT_CHANGE";
  threshold: number;
  keyword?: string;
  enabled: boolean;
  notifyEmail: string;
  lastTriggered?: string;
}

export interface SocialMention {
  id: string;
  websiteId: string;
  platform: "twitter" | "linkedin" | "facebook";
  content: string;
  url: string;
  engagement: {
    likes?: number;
    shares?: number;
    comments?: number;
  };
  createdAt: string;
}
