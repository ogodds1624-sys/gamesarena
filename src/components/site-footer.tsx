import { memo, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Send } from "lucide-react";
import { getSportyLink, submitTestimony } from "@/lib/admin-snapshot";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useLiveStorefront } from "@/lib/storefront-live";

const LINKS = [
  { to: "/", label: "Home" },
  { to: "/packages", label: "Packages" },
  { to: "/login", label: "Sign In" },
  { to: "/register", label: "Register" },
] as const;

export const SiteFooter = memo(function SiteFooter() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [text, setText] = useState("");
  const [stars, setStars] = useState(5);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      await submitTestimony({ data: { name, place, text, stars } });
      setName("");
      setPlace("");
      setText("");
      setStars(5);
      setNote("Thank you, review sent successfully.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Could not send your testimony.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="below-fold mt-12">
      <section className="mx-auto w-full max-w-md px-4" aria-label="Send your testimony">
        <div className="flex flex-col items-center">
          <p className="mb-3 text-center text-xs font-semibold tracking-wide text-[#a7a08a]">
            Got a win to share? We would love to hear your story.
          </p>
          <button
            id="send-testimony"
            type="button"
            onClick={() => (signedIn ? setOpen((value) => !value) : void navigate({ to: "/register" }))}
            aria-expanded={open && signedIn}
            aria-controls={open && signedIn ? "testimony-form" : undefined}
            className="testimony-cta group inline-flex min-h-14 items-center justify-center gap-3 rounded-2xl px-5 py-2.5 text-left"
          >
            <span className="testimony-cta-icon inline-flex size-9 shrink-0 items-center justify-center rounded-xl" aria-hidden>
              <Send className="size-4" />
            </span>
            <span className="flex flex-col">
              <span className="text-xs font-black tracking-[0.12em]">SEND YOUR TESTIMONY</span>
              <span className="mt-0.5 text-[10px] font-medium tracking-wide text-[#24200f]/75">Share your experience</span>
            </span>
            <ArrowUpRight className="testimony-cta-arrow ml-1 size-4 shrink-0" aria-hidden />
          </button>
          {open && signedIn ? (
            <form id="testimony-form" onSubmit={(event) => void onSubmit(event)} className="mt-3 w-full rounded-2xl border border-white/15 bg-black/25 px-4 py-4 backdrop-blur-md">
              <label className="block text-xs font-bold tracking-[0.14em] text-[#9aa3b2]">
                NAME
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm font-semibold tracking-normal text-white outline-none"
                />
              </label>
              <label className="mt-3 block text-xs font-bold tracking-[0.14em] text-[#9aa3b2]">
                LOCATION
                <input
                  value={place}
                  onChange={(event) => setPlace(event.target.value)}
                  placeholder="Accra, Ghana"
                  className="mt-1 h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-sm font-semibold tracking-normal text-white outline-none"
                />
              </label>
              <label className="mt-3 block text-xs font-bold tracking-[0.14em] text-[#9aa3b2]">
                TESTIMONY
                <textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-sm font-semibold tracking-normal text-white outline-none"
                />
              </label>
              <p className="mt-3 text-xs font-bold tracking-[0.14em] text-[#9aa3b2]">STAR RATING</p>
              <div className="mt-1 flex gap-1">
                {Array.from({ length: 5 }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setStars(index + 1)}
                    className={"text-2xl leading-none " + (index < stars ? "text-gold" : "text-white/25")}
                    aria-label={`${index + 1} stars`}
                  >
                    ★
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={busy}
                className="mt-4 inline-flex h-11 items-center justify-center rounded-xl bg-red px-4 text-xs font-extrabold tracking-wide text-white disabled:opacity-60"
              >
                {busy ? "SENDING" : "SEND"}
              </button>
              {note ? <p className="mt-2 text-sm text-white/80">{note}</p> : null}
            </form>
          ) : null}
        </div>
      </section>

      <div className="relative mt-10">
        <footer className="border-t border-white/10 bg-transparent text-white">
          <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-3">
        <section>
          <Link to="/" className="inline-flex items-center gap-2 text-white no-underline">
            <span className="text-base font-black tracking-tight italic">
              GAMES <span className="text-gold">HUB</span>
            </span>
          </Link>
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#8b95a7]">
            Explore Aviator insights, potential cash-out moments, and flexible session options—all in one place.
          </p>
        </section>

        <section>
          <h2 className="text-xs font-extrabold tracking-[0.16em] text-gold">LINKS</h2>
          <ul className="mt-3 space-y-2">
            {LINKS.filter((item) => {
              if (signedIn && (item.to === "/login" || item.to === "/register")) return false;
              return true;
            }).map((item) => (
              <li key={item.to}>
                <Link to={item.to} className="text-sm font-semibold text-white/80 no-underline hover:text-white">
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
                <a href={`mailto:${store.email}`} className="font-semibold text-white no-underline">
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
    </div>
  );
});
