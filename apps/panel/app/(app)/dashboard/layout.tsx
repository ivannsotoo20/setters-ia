/**
 * Layout dedicado para `/dashboard`.
 *
 * Misma estrategia que `/conversations` y `/pipeline`: altura clavada al
 * viewport (`h-[calc(100svh-3.5rem)]`) + neutralización del padding del main
 * parent + overflow-hidden.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-6 md:-m-8 h-[calc(100svh-3.5rem)] overflow-hidden flex flex-col">
      {children}
    </div>
  );
}
