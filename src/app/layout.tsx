import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Service Manager',
  description: 'Service Manager - Remote Device Control',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body style={{ margin: 0, padding: 0, background: '#F8FAFC' }}>
        {children}
      </body>
    </html>
  );
}
