import { memo, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { UserButton } from "@/lib/auth/gates";
import { getSportyLink } from "@/lib/admin-snapshot";
import { signOut } from "@/lib/auth/client";
import { useBlocked } from "@/lib/blocked-users";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const SiteHeader = memo(function SiteHeader() {
  const { user, isPending } = useCurrentUserState();
  const [linkState, setLinkState] = useState<{ id: string; linked: boolean } | null>(null);
  const [mounted, setMounted] = useState(false);
  const userId = user && !user.isDevFallback ? user.id : "";
  const blocked = useBlocked();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let stop = false;
    void getSportyLink()
      .then((link) => {
        if (!stop) setLinkState({ id: userId, linked: link.linked });
      })
      .catch(() => {
        if (!stop) setLinkState({ id: userId, linked: false });
      });
    return () => {
      stop = true;
    };
  }, [userId]);

  const known = linkState?.id === userId ? linkState.linked : null;
  const registered = Boolean(userId) && known === true && !blocked;
  const checking = Boolean(userId) && known === null && !blocked;

  return (
    <header className="site-header sticky top-0 z-40 bg-ink">
      <Link to="/" className="flex min-w-0 flex-1 items-center gap-2 text-white no-underline">
        <span className="truncate text-sm leading-none font-black tracking-tight italic sm:text-base">
          GAMES <span className="text-gold">HUB</span>
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {!mounted || checking || (isPending && !userId) ? (
          <div className="h-9 w-16 animate-pulse rounded-full bg-white/10 sm:w-24" aria-hidden />
        ) : registered ? (
          <div className="text-white">
            <UserButton />
          </div>
        ) : (
          <>
            <Link
              to="/login"
              className="inline-flex h-9 items-center justify-center rounded-full border border-gold/50 px-3 text-xs font-bold tracking-wide text-white no-underline transition-colors hover:bg-gold/10 sm:h-10 sm:px-4 sm:text-sm"
            >
              Sign In
            </Link>
            {blocked ? (
              <button
                type="button"
                onClick={() => void signOut("/")}
                className="inline-flex h-9 items-center justify-center rounded-full bg-gold px-3 text-xs font-bold tracking-wide text-black transition-colors hover:bg-gold/90 sm:h-10 sm:px-4 sm:text-sm"
              >
                Sign Out
              </button>
            ) : (
              <Link
                to="/register"
                className="inline-flex h-9 items-center justify-center rounded-full bg-gold px-3 text-xs font-bold tracking-wide text-black no-underline transition-colors hover:bg-gold/90 sm:h-10 sm:px-4 sm:text-sm"
              >
                Sign Up
              </Link>
            )}
          </>
        )}
      </div>
    </header>
  );
});
