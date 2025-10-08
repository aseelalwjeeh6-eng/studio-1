import type { Metadata } from 'next';
import './globals.css';
import '@livekit/components-styles';
import { Alegreya } from 'next/font/google';
import { cn } from '@/lib/utils';
import { AppProviders } from '@/app/providers';
import Hearts from '@/components/shared/Hearts';
import Script from 'next/script';
import { HeartIcon } from '@/components/icons/HeartIcon';
import Image from 'next/image';

const alegreya = Alegreya({
  subsets: ['latin'],
  variable: '--font-alegreya',
});

export const metadata: Metadata = {
  title: 'اصيل سينما',
  description: 'منصة مشاهدة أفلام للعشاق',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="icon" href="https://i.ibb.co/7J9rmdS0/1759934438802.jpg" />
        <link rel="apple-touch-icon" href="https://i.ibb.co/7J9rmdS0/1759934438802.jpg"></link>
        <meta name="theme-color" content="#26000A" />
      </head>
      <body className={cn('font-body antialiased', alegreya.className)}>
        <Script id="suppress-datachannel-error" strategy="beforeInteractive">
          {`
            if (typeof window !== 'undefined') {
              const originalConsoleError = console.error;
              console.error = (...args) => {
                const errorString = (args || []).join(' ');
                if (errorString.includes('Unknown DataChannel error')) {
                  return;
                }
                originalConsoleError.apply(console, args);
              };
            }
          `}
        </Script>
        <AppProviders>
          <Hearts />
          <main>{children}</main>
        </AppProviders>
      </body>
    </html>
  );
}
