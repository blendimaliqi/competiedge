declare module "@sparticuz/chromium" {
  export const args: string[];
  export const defaultViewport: {
    width: number;
    height: number;
  };
  export const executablePath: () => Promise<string>;
  export const headless: boolean;
  export const setGraphicsMode: boolean;
}
