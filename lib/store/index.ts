import { Website, Article } from "../types";

interface Alert {
  id: string;
  websiteId: string;
  message: string;
  createdAt: string;
}

interface LocalWebsite extends Website {
  knownArticles: Set<string>;
  previousArticleCount: number;
}

class Store {
  private websites: Map<string, LocalWebsite>;
  private alerts: Map<string, Alert>;

  constructor() {
    this.websites = new Map();
    this.alerts = new Map();

    if (typeof window !== "undefined") {
      const savedWebsites = localStorage.getItem("websites");
      const savedAlerts = localStorage.getItem("alerts");

      if (savedWebsites) {
        const parsedData = JSON.parse(savedWebsites);
        this.websites = new Map(
          parsedData.map(([id, website]: [string, any]) => [
            id,
            {
              ...website,
              knownArticles: new Set<string>(website.knownArticles || []),
              lastChecked: website.lastChecked || new Date().toISOString(),
              createdAt: website.createdAt || new Date().toISOString(),
              articles: website.articles?.map((article: any) => ({
                ...article,
                firstSeen: article.firstSeen || new Date().toISOString(),
              })),
            },
          ])
        );
      }

      if (savedAlerts) {
        this.alerts = new Map(JSON.parse(savedAlerts));
      }
    }
  }

  private saveToLocalStorage() {
    if (typeof window !== "undefined") {
      const websitesData = Array.from(this.websites.entries()).map(
        ([id, website]) => [
          id,
          {
            ...website,
            knownArticles: Array.from(website.knownArticles),
          },
        ]
      );

      localStorage.setItem("websites", JSON.stringify(websitesData));
      localStorage.setItem(
        "alerts",
        JSON.stringify(Array.from(this.alerts.entries()))
      );
    }
  }

  getAllWebsites(): Website[] {
    return Array.from(this.websites.values());
  }

  getWebsite(id: string): Website | undefined {
    return this.websites.get(id);
  }

  addWebsite(website: Website): Website {
    const initialArticles = website.articles || [];
    const knownArticles = new Set<string>(
      initialArticles.map((article) => article.title)
    );

    const newWebsite: LocalWebsite = {
      ...website,
      previousArticleCount: website.articleCount,
      knownArticles,
      articles: initialArticles.map((article) => ({
        ...article,
        firstSeen: new Date().toISOString(),
      })),
    };

    this.websites.set(website.id, newWebsite);
    this.saveToLocalStorage();
    return newWebsite;
  }

  updateWebsite(website: Website): Website {
    const existingWebsite = this.websites.get(website.id);
    if (!existingWebsite) {
      throw new Error("Website not found");
    }

    const knownArticles = existingWebsite.knownArticles;
    const newArticles =
      website.articles?.filter(
        (article) => !knownArticles.has(article.title)
      ) || [];

    const timestampedNewArticles = newArticles.map((article) => ({
      ...article,
      firstSeen: new Date().toISOString(),
    }));

    const updatedKnownArticles = new Set<string>(knownArticles);
    timestampedNewArticles.forEach((article) => {
      updatedKnownArticles.add(article.title);
    });

    const updatedWebsite: LocalWebsite = {
      ...website,
      knownArticles: updatedKnownArticles,
      articles: [
        ...(existingWebsite.articles || []),
        ...timestampedNewArticles,
      ],
      previousArticleCount: existingWebsite.articleCount,
      customContentPatterns:
        website.customContentPatterns || existingWebsite.customContentPatterns,
      customSkipPatterns:
        website.customSkipPatterns || existingWebsite.customSkipPatterns,
    };

    this.websites.set(website.id, updatedWebsite);
    this.saveToLocalStorage();
    return updatedWebsite;
  }

  updateWebsitePatterns(
    websiteId: string,
    customContentPatterns: string[],
    customSkipPatterns: string[]
  ): Website {
    const website = this.websites.get(websiteId);
    if (!website) {
      throw new Error("Website not found");
    }

    const updatedWebsite: LocalWebsite = {
      ...website,
      customContentPatterns,
      customSkipPatterns,
    };

    this.websites.set(websiteId, updatedWebsite);
    this.saveToLocalStorage();
    return updatedWebsite;
  }

  getAllAlerts(): Alert[] {
    return Array.from(this.alerts.values());
  }

  getAlert(id: string): Alert | undefined {
    return this.alerts.get(id);
  }

  addAlert(alert: Alert): Alert {
    this.alerts.set(alert.id, alert);
    this.saveToLocalStorage();
    return alert;
  }
}

export const store = new Store();
