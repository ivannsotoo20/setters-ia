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
            El motor normaliza el texto (lowercase + sin espacios) y comprueba si
            alguno de estos patrones aparece como substring. <strong>Bienvenida</strong>{' '}
            y <strong>lm</strong> se aplican a mensajes OUTBOUND (cuando tú o un
            automation escribís a un lead). <strong>Inbound</strong> también se
            aplica a mensajes INBOUND del lead (ej. lead orgánico que escribe
            &quot;info&quot;, &quot;programa&quot;, &quot;precio&quot;) → IA entra
            automáticamente. Si nada matchea en un inbound bajo modo classified_only
            → asume intervención humana y pausa la IA.
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

      <Card className="border-warning/30 bg-warning/5">
        <CardHeader>
          <CardTitle className="text-base">
            Keywords vs Etiquetas — ¿en qué se diferencian?
          </CardTitle>
          <CardDescription>Son dos sistemas independientes con propósitos distintos.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <div>
            <p className="font-medium text-foreground mb-1">
              📌 Keywords (esta página): clasifican el ORIGEN de un mensaje del trainer o del lead
            </p>
            <p className="leading-relaxed">
              Cuando GHL/ManyChat te avisa de un mensaje, el motor revisa el texto y lo
              clasifica. <strong>Bienvenida</strong> aplica solo a OUTBOUND (tú escribís a un lead) → activa IA en F1.{' '}
              <strong>Lm</strong> aplica solo a OUTBOUND → registra como entrega de lead magnet.{' '}
              <strong>Inbound</strong> aplica tanto a OUTBOUND como a INBOUND del lead — útil para
              que leads orgánicos que escriben &quot;info&quot;, &quot;programa&quot;,
              &quot;precio&quot; activen la IA sin que el trainer tenga que intervenir manualmente.
              Si nada matchea en un inbound bajo modo classified_only → IA pausada hasta que el
              trainer decida.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">
              🏷️ Etiquetas (Configuración → Etiquetas): clasifican el ESTADO de una conversación
            </p>
            <p className="leading-relaxed">
              Las etiquetas son chips de colores que se aplican a las conversaciones del kanban
              (&quot;Hot Lead&quot;, &quot;Comprado&quot;, &quot;Perdido&quot;, &quot;No
              responde&quot;). Pueden aplicarse a mano o vía reglas (cuando el lead dice X, o
              llega a la fase Y). Sirven para organización visual y workflow del trainer en el
              SaaS — no afectan al routing del motor.
            </p>
          </div>
          <p className="text-xs italic pt-2 border-t border-warning/20">
            En resumen: keywords = quién es el lead que entra (origen). Etiquetas = qué pasa
            con el lead que ya tienes (estado). Configurar bien las dos cosas es independiente.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
