'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  value: string;
  onChange: (value: string) => void;
  id?: string;
}

const PRESET_COLORS = [
  '#ef4444', // rojo
  '#f97316', // naranja
  '#eab308', // amarillo
  '#84cc16', // lima
  '#10b981', // verde
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // azul
  '#6366f1', // indigo
  '#a855f7', // morado
  '#ec4899', // rosa
  '#94a3b8', // gris
];

const HEX_REGEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Color picker — paleta 12 colores + input hex personalizado.
 * Onchange siempre devuelve hex `#RRGGBB`. Validación básica al input custom.
 */
export function ColorPicker({ value, onChange, id }: Props) {
  const [customHex, setCustomHex] = useState(value);

  const normalize = (raw: string): string | null => {
    const trimmed = raw.trim();
    if (!trimmed.startsWith('#')) return HEX_REGEX.test(`#${trimmed}`) ? `#${trimmed}` : null;
    return HEX_REGEX.test(trimmed) ? trimmed : null;
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-6 gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              onChange(c);
              setCustomHex(c);
            }}
            className={cn(
              'size-7 rounded-md border-2 transition-all hover:scale-110 flex items-center justify-center',
              value.toLowerCase() === c.toLowerCase()
                ? 'border-foreground'
                : 'border-transparent',
            )}
            style={{ backgroundColor: c }}
            aria-label={`Color ${c}`}
          >
            {value.toLowerCase() === c.toLowerCase() ? (
              <Check className="size-3.5 text-white drop-shadow" />
            ) : null}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor={id ?? 'custom-hex'} className="text-xs text-muted-foreground shrink-0">
          O custom
        </Label>
        <Input
          id={id ?? 'custom-hex'}
          type="text"
          value={customHex}
          onChange={(e) => {
            setCustomHex(e.target.value);
            const norm = normalize(e.target.value);
            if (norm) onChange(norm);
          }}
          placeholder="#RRGGBB"
          maxLength={7}
          className="h-7 font-mono text-xs"
        />
        <span
          className="size-7 rounded-md border border-border shrink-0"
          style={{ backgroundColor: HEX_REGEX.test(customHex) ? customHex : 'transparent' }}
        />
      </div>
    </div>
  );
}
