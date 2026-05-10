/**
 * Layout dedicado para `/pipeline`.
 *
 * Misma estrategia que `/conversations`: altura clavada al viewport
 * (`h-[calc(100svh-3.5rem)]`) + neutralización del padding del main parent
 * + overflow-hidden para que el board horizontal-scroll funcione.
 */
export default function PipelineLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-6 md:-m-8 h-[calc(100svh-3.5rem)] overflow-hidden flex flex-col">
      {children}
    </div>
  );
}
