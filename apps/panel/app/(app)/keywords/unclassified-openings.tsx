import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { UnclassifiedOpenings } from '@/lib/actions/keywords';
import type { OpeningGroup } from '@/lib/unclassified-openings';
import { AddKeywordDialog } from './add-keyword-dialog';

const dayFormat = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'Europe/Madrid',
});

/**
 * 2026-10-21 — los primeros mensajes de la entrenadora que el asistente no
 * reconoce como su bienvenida. Caso real (tenant 7): abría con textos que no
 * tenía registrados y el conteo de bienvenidas se rompía sin que nada se lo
 * dijera. Cada texto lleva un botón para darlo de alta con un trozo propuesto.
 */
export function UnclassifiedOpeningsCard({ data }: { data: UnclassifiedOpenings }) {
  if (data.notRecognized.length === 0 && data.countedAsKeyword.length === 0) return null;

  return (
    <Card className="border-warning/40">
      <CardHeader>
        <CardTitle className="text-base">Mensajes tuyos que no cuentan como bienvenida</CardTitle>
        <CardDescription>
          Son los primeros mensajes con los que has abierto conversaciones en los últimos{' '}
          {data.sinceDays} días y que tu asistente no reconoce como tu saludo de bienvenida. Si
          alguno lo es, dalo de alta: a partir de ese momento contará como bienvenida.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {data.notRecognized.length > 0 ? (
          <OpeningList
            title="No los reconoce: la conversación no se abre y el asistente no entra"
            groups={data.notRecognized}
          />
        ) : null}
        {data.countedAsKeyword.length > 0 ? (
          <OpeningList
            title="Se cuentan como palabra clave, no como bienvenida"
            groups={data.countedAsKeyword}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function OpeningList({ title, groups }: { title: string; groups: OpeningGroup[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{title}</p>
      <ul className="divide-y divide-border rounded-md border border-border">
        {groups.map((g) => (
          <li
            key={`${g.lastAt}-${g.text}`}
            className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <p className="text-sm line-clamp-2 break-words">«{g.text}»</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {g.count} {g.count === 1 ? 'conversación' : 'conversaciones'} · la última el{' '}
                {dayFormat.format(new Date(g.lastAt))}
              </p>
            </div>
            <AddKeywordDialog
              defaultType="bienvenida"
              defaultPattern={g.suggestedPattern}
              trigger={
                <Button size="sm" variant="outline" className="shrink-0">
                  Darla de alta
                </Button>
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
