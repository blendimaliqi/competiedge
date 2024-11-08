declare module "rss-parser" {
  export interface CustomFields {
    item?: string[][];
  }

  export interface Item {
    title?: string;
    link?: string;
    pubDate?: string;
    creator?: string;
    content?: string;
    contentSnippet?: string;
    guid?: string;
    isoDate?: string;
    media?: any;
    contentEncoded?: string;
  }

  export interface Output<T extends Item> {
    items: T[];
    feedUrl?: string;
    title?: string;
    description?: string;
    link?: string;
    language?: string;
    lastBuildDate?: string;
  }

  export interface ParserOptions {
    customFields?: CustomFields;
    headers?: Record<string, string>;
    timeout?: number;
  }

  export default class Parser<F extends Output<T>, T extends Item> {
    constructor(options?: ParserOptions);
    parseURL(url: string): Promise<F>;
    parseString(xml: string): Promise<F>;
  }
}
