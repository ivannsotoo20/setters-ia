/**
 * Sprint Mu — Layout full-bleed para /contacts. Mismo patrón que
 * /conversations: clava altura al viewport, neutraliza padding del <main>
 * parent para tener filter pane lateral pegado al sidebar y list pane
 * ocupando el resto, sin scroll exterior.
 */
export default function ContactsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-6 md:-m-8 h-[calc(100svh-3.5rem)] overflow-hidden flex flex-col">
      {children}
    </div>
  );
}
