import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '../index.css';
import Providers from './providers';

export const metadata: Metadata = {
  title: 'SMART Traffic Light — LGU Dashboard',
  icons: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='16' fill='%230284c7'/%3E%3C/svg%3E",
};

// Applies the saved theme before first paint, so light-mode users don't see a dark flash.
const themeScript = "try { if (localStorage.getItem('stl-theme') === 'light') document.documentElement.classList.add('light'); } catch {}";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The theme script edits <html class> before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
