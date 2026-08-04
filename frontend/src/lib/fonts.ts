import localFont from 'next/font/local';
import { JetBrains_Mono } from 'next/font/google';

// "Marker" type system — docs/studysheet-build-prompt.md §9. Clash Display
// and Satoshi (Fontshare, free for commercial use) are self-hosted via
// next/font/local rather than linked from Fontshare's CDN — self-hosting
// avoids a third-party network round trip on the landing page, which matters
// for the LCP/TTI budgets M7 is graded on. JetBrains Mono is on Google
// Fonts, so next/font/google handles it directly.
export const clashDisplay = localFont({
  src: '../fonts/ClashDisplay-600.woff2',
  weight: '600',
  variable: '--font-display',
  display: 'swap',
});

export const satoshi = localFont({
  src: [
    { path: '../fonts/Satoshi-400.woff2', weight: '400' },
    { path: '../fonts/Satoshi-500.woff2', weight: '500' },
    { path: '../fonts/Satoshi-700.woff2', weight: '700' },
  ],
  variable: '--font-body',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
