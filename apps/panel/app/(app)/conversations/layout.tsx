/**
 * Layout dedicado para `/conversations` que neutraliza el padding del
 * `<main>` parent (`p-6 md:p-8` definido en `(app)/layout.tsx`) para que el
 * shell de 3 paneles ocupe el ancho completo de la SidebarInset, y le da
 * altura definida vía flex-col + min-h-0 para que los `overflow-y-auto`
 * internos del thread/lista/panel funcionen sin desbordar la página.
 */
export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-6 md:-m-8 flex-1 flex flex-col min-h-0 overflow-hidden">
      {children}
    </div>
  );
}
