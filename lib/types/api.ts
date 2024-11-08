// Request Types
export interface ScrapeRequestBody {
  url: string;
  name?: string;
  isInitialAdd?: boolean;
}

export interface CreateWebsiteRequestBody {
  name: string;
  url: string;
  articleCount?: number;
  customContentPatterns?: string[];
  customSkipPatterns?: string[];
}

export interface UpdateWebsitePatternsRequestBody {
  customContentPatterns: string[];
  customSkipPatterns: string[];
}

// Route Params Types
export interface WebsiteRouteParams {
  params: {
    id: string;
  };
}

// Response Types
export interface SuccessResponse {
  success: boolean;
}

export interface ErrorResponse {
  error: string;
}
