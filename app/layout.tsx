import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { RouteShell } from '@/components/route-shell';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CasePoint',
  description: 'ניהול תיקי לקוחות, מסמכים ותשלומים עבור מלווה בהגשות למשרדי ממשלה.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={sans.variable}>
      <body className={sans.className} dir="rtl">
        <RouteShell>{children}</RouteShell>
      </body>
    </html>
  );
}
