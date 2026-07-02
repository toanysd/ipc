import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Đại Cung Điện | Camera Dashboard',
  description: 'Quản lý và giám sát Camera tự động qua WiFi',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body>
        <div className="bg-orbs">
          <div className="orb orb-1"></div>
          <div className="orb orb-2"></div>
        </div>
        {children}
      </body>
    </html>
  );
}
