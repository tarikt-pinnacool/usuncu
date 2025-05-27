// app/layout.tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import QueryProvider from "@/components/QueryProvider";
import { I18nProvider } from "@/context/i18nContext";
import { defaultLocale } from "@/locales";
import { ClientLangUpdater } from "@/components/ClientLangUpdater";
import { DynamicHead } from "@/components/DynamicHead";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "U suncu",
  description: "Pronađi sunčana ili sjenovita mjesta u svom gradu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={defaultLocale} suppressHydrationWarning>
      <body className={inter.className}>
        <I18nProvider>
          <DynamicHead />
          <ClientLangUpdater />
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <QueryProvider>{children}</QueryProvider>
            <SonnerToaster richColors position="top-right" />
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
