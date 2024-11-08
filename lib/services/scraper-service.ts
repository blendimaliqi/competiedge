export interface ScrapedData {
  title: string;
  articleCount: number;
  lastChecked: Date;
  url: string;
}

export async function scrapeWebsite(url: string): Promise<ScrapedData> {
  const response = await fetch("/api/scrape", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url }),
  });

  if (!response.ok) {
    throw new Error("Failed to scrape website");
  }

  return response.json();
}
