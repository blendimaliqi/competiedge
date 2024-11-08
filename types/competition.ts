export interface Competitor {
  id: string;
  name: string;
  website: string;
  socialMedia?: {
    twitter?: string;
    linkedin?: string;
    facebook?: string;
  };
  products: Product[];
}

export interface Product {
  id: string;
  name: string;
  price: number;
  url: string;
  lastUpdated: Date;
  priceHistory: PricePoint[];
}

export interface PricePoint {
  price: number;
  date: Date;
}

export interface MonitoringAlert {
  id: string;
  type: "PRICE_CHANGE" | "NEW_PRODUCT" | "SOCIAL_MEDIA" | "CUSTOM";
  severity: "LOW" | "MEDIUM" | "HIGH";
  message: string;
  timestamp: Date;
  competitorId: string;
}
