// locales/index.ts
export const locales = ["en", "bhs"] as const;
export const defaultLocale = "bhs"; // Or 'en'
export type Locale = (typeof locales)[number];
