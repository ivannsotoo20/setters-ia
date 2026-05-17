import Image from 'next/image';
import { cn } from '@/lib/utils';

interface Props {
  /**
   * - `mark`: solo isotipo cuadrado (chevrones + diamante), 256x256 nativo.
   *   Para sidebar header, favicons inline, avatars de marca.
   * - `full`: logo + wordmark "fyzon" (vertical), 461x358 nativo.
   *   Para login/auth/landing.
   */
  variant?: 'mark' | 'full';
  className?: string;
  priority?: boolean;
}

export function FyzonLogo({ variant = 'mark', className, priority = false }: Props) {
  if (variant === 'mark') {
    return (
      <Image
        src="/fyzon-mark.png"
        alt="Fyzon"
        width={256}
        height={256}
        priority={priority}
        className={cn('rounded-md object-contain shrink-0', className)}
      />
    );
  }

  return (
    <Image
      src="/fyzon-logo.png"
      alt="Fyzon"
      width={461}
      height={358}
      priority={priority}
      className={cn('h-auto w-auto object-contain', className)}
    />
  );
}
