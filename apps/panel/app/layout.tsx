import type { Metadata } from 'next';
import './globals.css';
import { Geist } from 'next/font/google';
import { cn } from '@/lib/utils';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Fyzon Setters — Panel',
  description: 'Panel SaaS para configurar tu setter IA de WhatsApp, Instagram y Facebook.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="es"
      className={cn('dark font-sans antialiased', geist.variable)}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground">
        <TooltipProvider delayDuration={150}>
          {children}
          <Toaster richColors closeButton position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
