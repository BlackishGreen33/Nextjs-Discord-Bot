import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';

import '@/common/styles/globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Life_is_DAGIGI | Nextjs Discord Bot',
  description: 'Life_is_DAGIGI | Nextjs Discord Bot',
  keywords: [
    'nextjs',
    'discord',
    'bot',
    'boilerplate',
    'react',
    'typescript',
    'discord bot development',
    'nextjs discord bot',
  ],
  authors: [
    {
      name: 'BlackishGreen33',
      url: 'https://github.com/BlackishGreen33',
    },
  ],
  creator: 'BlackishGreen33',
  publisher: 'https://github.com/BlackishGreen33',
  openGraph: {
    title: 'Life_is_DAGIGI | Nextjs Discord Bot',
    description: 'Life_is_DAGIGI | Nextjs Discord Bot',
    url: 'https://github.com/BlackishGreen33/Discord-Bot',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
