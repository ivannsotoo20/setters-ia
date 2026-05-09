/**
 * Layout dedicado para `/conversations` que neutraliza el padding del
 * `<main>` parent (`p-6 md:p-8` definido en `(app)/layout.tsx`) para que el
 * shell de 3 paneles ocupe el ancho completo de la SidebarInset.
 */
export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  return <div className="-m-6 md:-m-8">{children}</div>;
}
