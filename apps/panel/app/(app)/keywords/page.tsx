import { listKeywords } from '@/lib/actions/keywords';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { KeywordsList } from './keywords-list';
import { AddKeywordDialog } from './add-keyword-dialog';

export const dynamic = 'force-dynamic';

export default async function KeywordsPage() {
  const result = await listKeywords();
  const keywords = result.ok ? result.data ?? [] : [];

  const counts = {
    bienvenida: keywords.filter((k) => k.type === 'bienvenida').length,
    lm: keywords.filter((k) => k.type === 'lm').length,
    inbound: keywords.filter((k) => k.type === 'inbound').length,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Configuración
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Keywords</h1>
        </div>
        <AddKeywordDialog />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Bienvenidas</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.bienvenida}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Saludos manuales que el trainer envía al primer contacto del lead.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Lead Magnets</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.lm}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Recursos / lead magnets entregados automáticamente.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Inbound auto</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.inbound}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Auto-respuestas tipo &quot;gracias por escribir&quot;.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Patrones cargados ({keywords.length})
          </CardTitle>
          <CardDescription>
            Cuando llega un mensaje OUTBOUND desde el chat (humano), el motor
            normaliza el texto (lowercase + sin espacios) y comprueba si alguno de
            estos patrones aparece como substring. Si match → clasifica el origen
            de la conversación. Si no match → asume intervención humana y pausa
            la IA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!result.ok ? (
            <p className="text-sm text-destructive">Error: {result.error}</p>
          ) : keywords.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin patrones todavía. Click en &quot;Añadir keyword&quot; para
              empezar. Como mínimo añade tu mensaje de bienvenida típico para que
              el motor reconozca cuando le das un saludo manual a un lead nuevo.
            </p>
          ) : (
            <KeywordsList keywords={keywords} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
