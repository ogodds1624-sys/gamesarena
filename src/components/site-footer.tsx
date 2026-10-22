import { memo, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { getSportyLink } from "@/lib/admin-snapshot";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useLiveStorefront } from "@/lib/storefront-live";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/packages", label: "Packages" },
  { to: "/login", label: "Sign In" },
  { to: "/register", label: "Register" },
] as const;

export const SiteFooter = memo(function SiteFooter() {
  const { user, isPending } = useCurrentUserState();
  const userId = user?.id ?? "";
  const devFallback = user?.isDevFallback === true;
  const [linked, setLinked] = useState(false);
  const signedIn = !isPending && Boolean(user) && !user?.isDevFallback && linked;
  const store = useLiveStorefront();
  useEffect(() => {
    if (isPending || !userId || devFallback) {
      setLinked(false);
      return;
    }
    let current = true;
    void getSportyLink()
      .then((link) => {
        if (current) setLinked(link.linked);
      })
      .catch(() => {
        if (current) setLinked(false);
      });
    return () => {
      current = false;
    };
  }, [isPending, userId, devFallback]);

  return (
    <div className="below-fold mt-12">
      <footer className="border-t border-white/10 bg-transparent text-white">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
          <section>
            <Link to="/" className="inline-flex items-center gap-2 text-white no-underline">
              <span className="text-base font-black tracking-tight italic">
                GAMES <span className="text-gold">HUB</span>
              </span>
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#8b95a7]">
              Explore Aviator insights, potential cash-out moments, and flexible session options—all
              in one place.
            </p>
          </section>
          <section>
            <h2 className="text-xs font-extrabold tracking-[0.16em] text-gold">LINKS</h2>
            <ul className="mt-3 space-y-2">
              {LINKS.filter(
                (item) => !signedIn || (item.to !== "/login" && item.to !== "/register"),
              ).map((item) => (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className="text-sm font-semibold text-white/80 no-underline hover:text-white"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <section>
            <h2 className="text-xs font-extrabold tracking-[0.16em] text-gold">SUPPORT</h2>
            <ul className="mt-3 space-y-2 text-sm text-white/80">
              <li>Desk and signal help</li>
              <li>Payment confirmation</li>
              {store?.email ? (
                <li>
                  <a
                    href={`mailto:${store.email}`}
                    className="font-semibold text-white no-underline"
                  >
                    {store.email}
                  </a>
                </li>
              ) : null}
            </ul>
          </section>
        </div>
        <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-[#8b95a7]">
          Games Hub · Predictions for the live desk
        </div>
      </footer>
    </div>
  );
});
