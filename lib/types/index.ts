export interface Article {
  id?: string;
  title: string;
  url: string;
  path: string;
  summary?: string;
  date?: string;
  firstSeen: string;
  hidden?: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface Website {
  id: string;
  name: string;
  url: string;
  articleCount: number;
  lastChecked: string | null;
  createdAt: string | null;
  customContentPatterns: string[];
  customSkipPatterns: string[];
  articles?: Article[];
  feed_url?: string | null;
  feed_enabled?: boolean;
  category_id?: string | null;
}

export interface CreateWebsiteDTO {
  name: string;
  url: string;
  articleCount?: number;
  customContentPatterns?: string[];
  customSkipPatterns?: string[];
}

export interface ScrapeResponse {
  title: string;
  articleCount: number;
  lastChecked: Date;
  url: string;
  data: string;
}

export type ApiResponse<T> = T | { error: string };

export interface WebsiteCardProps {
  website: Website;
  categories: Category[];
  expandedHistory: { [key: string]: boolean };
  editingPatterns: string | null;
  refreshingWebsites: Set<string>;
  deleting: string | null;
  sitesWithNewContent: Set<string>;
  expandedNewArticles: Set<string>;
  newArticles: { [key: string]: Article[] };
  onToggleHistory: (websiteId: string) => void;
  onRefresh: (websiteId: string) => void;
  onDelete: (websiteId: string) => void;
  onSetEditingPatterns: (websiteId: string | null) => void;
  onToggleNewArticles: (websiteId: string) => void;
  onToggleArticleVisibility: (articleId: string, hidden: boolean) => void;
  onAddContentPattern: (websiteId: string, pattern: string) => void;
  onAddSkipPattern: (websiteId: string, pattern: string) => void;
  onRemovePattern: (
    websiteId: string,
    pattern: string,
    type: "content" | "skip"
  ) => void;
  onToggleFeed: (websiteId: string, enabled: boolean) => void;
  onCategoryChange: (websiteId: string, categoryId: string) => void;
  formatDate: (dateStr: string | null | undefined) => string;
}
