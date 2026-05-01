import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Fyzon Setters — Panel',
  description: 'Panel SaaS para configurar tu setter IA de WhatsApp, Instagram y Facebook.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
