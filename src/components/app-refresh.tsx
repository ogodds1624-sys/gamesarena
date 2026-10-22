import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

export function AppRefresh() {
  const [installed, setInstalled] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const display = window.matchMedia("(display-mode: standalone)");
    const update = () => {
      setInstalled(
        display.matches || ("standalone" in navigator && navigator.standalone === true),
      );
    };
    update();
    display.addEventListener("change", update);
    return () => display.removeEventListener("change", update);
  }, []);

  if (!installed) return null;

  return (
    <button
      type="button"
      disabled={refreshing}
      onClick={() => {
        setRefreshing(true);
        window.location.reload();
      }}
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-[max(1rem,env(safe-area-inset-left))] z-40 inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 bg-[#e50914] px-4 py-3 text-sm font-extrabold text-white shadow-lg disabled:opacity-60"
      aria-label="Refresh page"
    >
      <RefreshCw size={18} className={refreshing ? "animate-spin" : undefined} aria-hidden />
      {refreshing ? "Refreshing..." : "Refresh"}
    </button>
  );
}
