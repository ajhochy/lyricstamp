export {};

declare global {
  interface Window {
    lyricstamp?: {
      chooseAbletonFolder: () => Promise<string | null>;
    };
  }
}
