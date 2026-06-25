"use client";

import { useState, useEffect } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { getBalanceStudioData } from "@/lib/actions/balance-studio";
import type { BalanceStudioData } from "@/lib/actions/balance-studio";
import { BalanceStudio } from "@/components/admin/balance-studio";

export function BalanceStudioTab() {
  const [data, setData] = useState<BalanceStudioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    getBalanceStudioData()
      .then((d) => { setData(d); setLoading(false); if (!d) setError(true); })
      .catch(() => { setLoading(false); setError(true); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-zinc-500">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        Balance Studio wird geladen…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-400">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        Fehler beim Laden der Balance-Daten. Bitte Seite neu laden.
      </div>
    );
  }

  return <BalanceStudio initialData={data} />;
}
