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
          <h1 className="text-2xl font-semibold tracking-tight">
            Cuándo entra tu asistente
          </h1>
        </div>
        <AddKeywordDialog />
      </div>

      <p className="text-sm text-muted-foreground max-w-2xl">
        Tu asistente no responde a todo el mundo por defecto: primero comprueba que la
        conversación es de las que le tocan. Lo hace mirando si el mensaje contiene alguna de
        las palabras que guardes aquí. Puedes añadirlas, quitarlas o desactivarlas cuando
        quieras, sin avisar a nadie.
      </p>

      {counts.bienvenida === 0 ? (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Falta tu mensaje de bienvenida
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cuando eres tú quien escribe primero a alguien, el asistente necesita reconocer ese
            saludo tuyo para saber que puede seguir la conversación. Como todavía no has
            guardado ninguna palabra de bienvenida,{' '}
            <strong className="text-foreground">
              ahora mismo no continuará ninguna conversación que empieces tú
            </strong>
            . Añade abajo un trozo característico de tu saludo habitual.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cuando escribes tú primero</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.bienvenida}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Tu saludo de bienvenida. Al reconocerlo, el asistente sigue la conversación desde ahí.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cuando entregas un recurso</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.lm}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Guías, clases o vídeos gratuitos. El asistente sabe que esa persona pidió el recurso,
            no el programa.
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cuando te escriben a ti</CardDescription>
            <CardTitle className="text-2xl tabular-nums">{counts.inbound}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Palabras que suelen usar quienes te escriben con interés real: «info», «precio», o
            las de tu especialidad.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Tus palabras guardadas ({keywords.length})
          </CardTitle>
          <CardDescription>
            No hace falta escribir la frase entera ni cuidar mayúsculas o acentos de más: basta
            con un trozo característico. Si guardas «gracias por escribir», también reconocerá
            «¡Hola! Gracias por escribirme».
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!result.ok ? (
            <p className="text-sm text-destructive">
              No se han podido cargar tus palabras: {result.error}
            </p>
          ) : keywords.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no has guardado ninguna. Empieza por tu saludo de bienvenida.
            </p>
          ) : (
            <KeywordsList keywords={keywords} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            ¿En qué se diferencian de las etiquetas?
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-3">
          <p className="leading-relaxed">
            <strong className="text-foreground">Esta página decide cuándo entra tu asistente.</strong>{' '}
            Mira el texto del mensaje en el momento en que llega y, según lo que encuentre,
            arranca la conversación o la deja para ti.
          </p>
          <p className="leading-relaxed">
            <strong className="text-foreground">Las etiquetas</strong> (en Configuración →
            Etiquetas) son los colores que ves sobre las conversaciones que ya tienes abiertas:
            «Hot Lead», «Comprado», «Perdido». Sirven para organizarte, y no cambian el
            comportamiento del asistente.
          </p>
          <p className="text-xs italic pt-2 border-t border-border">
            En corto: aquí decides <strong>quién entra</strong>. En etiquetas organizas{' '}
            <strong>lo que ya tienes dentro</strong>. Se configuran por separado.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
