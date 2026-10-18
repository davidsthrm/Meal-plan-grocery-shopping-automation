import { NeedsConnection } from "@/components/connection";

/** The settings are stored on the server: nothing of them can be changed offline. */
export default function SettingsLayout({ children }: LayoutProps<"/einstellungen">) {
  return (
    <>
      <NeedsConnection>
        Die Einstellungen werden auf dem Server gespeichert und brauchen dafür eine Verbindung.
      </NeedsConnection>
      {children}
    </>
  );
}
