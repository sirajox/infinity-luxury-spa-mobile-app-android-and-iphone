import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Fonts are bundled with the app (no third-party font requests): Lora for headlines, Poppins for the interface.
const poppins = localFont({
  variable: '--font-poppins',
  display: 'swap',
  src: [
    { path: './Poppins_400Regular.ttf', weight: '400' },
    { path: './Poppins_500Medium.ttf', weight: '500' },
    { path: './Poppins_600SemiBold.ttf', weight: '600' },
  ],
});
const lora = localFont({
  variable: '--font-lora',
  display: 'swap',
  src: [
    { path: './Lora_500Medium.ttf', weight: '500' },
    { path: './Lora_600SemiBold.ttf', weight: '600' },
  ],
});

export const metadata: Metadata = {
  title: { default: 'Infinity Admin', template: '%s · Infinity Admin' },
  description: 'Business operations for Infinity Luxury Spa & Aesthetics.',
  robots: { index: false, follow: false },
  icons: { icon: '/logo.png' },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0D0D0D' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${lora.variable}`}>
      <body>{children}</body>
    </html>
  );
}
