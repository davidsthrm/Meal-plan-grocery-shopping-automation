import { NeedsConnection } from "@/components/connection";

/** The import reads photos with a model on the server: nothing of it works offline. */
export default function ImportLayout({ children }: LayoutProps<"/import">) {
  return (
    <>
      <NeedsConnection>
        Der Import liest Fotos auf dem Server und braucht dafür eine Verbindung.
      </NeedsConnection>
      {children}
    </>
  );
}
