import Link from "next/link";

interface Props {
  searchParams: Promise<{ reason?: string }>;
}

export default async function AuthCodeErrorPage({ searchParams }: Props) {
  const { reason } = await searchParams;
  const isDeviceBanned = reason === "device_banned";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-zinc-300">
      <h1 className="text-2xl font-bold">
        {isDeviceBanned ? "Zugriff verweigert" : "Login fehlgeschlagen"}
      </h1>
      <p className="max-w-sm text-zinc-400">
        {isDeviceBanned
          ? "Dieses Gerät wurde von der Plattform ausgeschlossen. Wende dich an den Support, falls du glaubst, dass das ein Fehler ist."
          : "Beim Login mit Discord ist ein Fehler aufgetreten. Bitte versuche es erneut."}
      </p>
      <Link href="/" className="text-purple-400 underline">
        Zurück zur Startseite
      </Link>
    </div>
  );
}
