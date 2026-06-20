import Link from "next/link";

export default function AuthCodeErrorPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center text-zinc-300">
      <h1 className="text-2xl font-bold">Login fehlgeschlagen</h1>
      <p className="text-zinc-400">
        Beim Login mit Discord ist ein Fehler aufgetreten. Bitte versuche es
        erneut.
      </p>
      <Link href="/" className="text-purple-400 underline">
        Zurück zur Startseite
      </Link>
    </div>
  );
}
