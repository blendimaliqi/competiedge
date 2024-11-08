export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      websites: {
        Row: {
          id: string;
          name: string;
          url: string;
          article_count: number;
          last_checked: string;
          created_at: string;
          custom_content_patterns: string[] | null;
          custom_skip_patterns: string[] | null;
          feed_url: string | null;
          feed_enabled: boolean;
          category_id: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          url: string;
          article_count?: number;
          last_checked?: string;
          created_at?: string;
          custom_content_patterns?: string[] | null;
          custom_skip_patterns?: string[] | null;
          feed_url?: string | null;
          feed_enabled?: boolean;
          category_id?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          url?: string;
          article_count?: number;
          last_checked?: string;
          created_at?: string;
          custom_content_patterns?: string[] | null;
          custom_skip_patterns?: string[] | null;
          feed_url?: string | null;
          feed_enabled?: boolean;
          category_id?: string | null;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          created_at?: string;
        };
      };
      articles: {
        Row: {
          id: string;
          website_id: string;
          title: string;
          url: string;
          path: string;
          summary: string | null;
          published_date: string | null;
          first_seen: string;
          created_at: string;
          hidden: boolean;
        };
        Insert: {
          id?: string;
          website_id: string;
          title: string;
          url: string;
          path: string;
          summary?: string | null;
          published_date?: string | null;
          first_seen?: string;
          created_at?: string;
          hidden?: boolean;
        };
        Update: {
          id?: string;
          website_id?: string;
          title?: string;
          url?: string;
          path?: string;
          summary?: string | null;
          published_date?: string | null;
          first_seen?: string;
          created_at?: string;
          hidden?: boolean;
        };
      };
    };
  };
}
