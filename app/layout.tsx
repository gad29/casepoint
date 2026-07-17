import type { Metadata } from 'next';
import { Noto_Sans_Hebrew } from 'next/font/google';
import './globals.css';
import { RouteShell } from '@/components/route-shell';

const sans = Noto_Sans_Hebrew({
  subsets: ['hebrew', 'latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CRM_YE',
  description: 'ניהול תיקי לקוחות, מסמכים ותשלומים עבור מלווה בהגשות למשרדי ממשלה.',
};

// Applies the saved theme before paint to avoid a light-mode flash.
const themeInit = `(function(){try{var t=localStorage.getItem('crmye-theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={sans.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={sans.className} dir="rtl">
        <RouteShell>{children}</RouteShell>
      </body>
    </html>
  );
}
