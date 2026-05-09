/**
 * Layout dedicado para `/conversations`.
 *
 * Estrategia: clavamos la altura al viewport directamente vía
 * `h-[calc(100svh-3.5rem)]` (3.5rem = altura del header sticky h-14). Esto
 * evita depender de propagación flex desde el SidebarProvider/main, que
 * tenía cadenas largas y un eslabón roto bloqueaba el scroll del thread.
 *
 * `overflow-hidden` clipa el shell internamente para que los `overflow-y-auto`
 * de cada pane (lista, thread, panel derecho) funcionen como contenedor de
 * scroll independiente.
 *
 * `-m-6 md:-m-8` neutraliza el padding del `<main>` parent para que el shell
 * sea full-bleed.
 *
 * Trade-off conocido: si el ImpersonateBanner está visible (~2.5rem extra),
 * el shell se solapa esos 2.5rem con el área del banner. Iván puede vivir
 * con eso por ahora; si molesta, se mueve a `calc(100svh-6rem)` o se mide
 * dinámicamente.
 */
export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-6 md:-m-8 h-[calc(100svh-3.5rem)] overflow-hidden flex flex-col">
      {children}
    </div>
  );
}
