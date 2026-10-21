import { useEffect, useRef, useState, type FormEvent } from "react";
import { savePricing, type AdminSnapshot } from "@/lib/admin-snapshot";
import { validatePricing, type PricingSettings } from "@/lib/pricing";
import { bumpGateway } from "@/lib/storefront-live";

const COUNTRIES = ["Ghana", "Nigeria"] as const;
const LABELS = { quick: "Quick session", popular: "Most popular", extended: "Extended session" };

function pricingFields(pricing: PricingSettings) {
  const fields = (country: (typeof COUNTRIES)[number]) => ({
    activationFee: String(pricing[country].activationFee),
    packages: pricing[country].packages.map((pack) => ({
      id: pack.id,
      price: String(pack.price),
      minutes: String(pack.minutes),
    })),
  });
  return { Ghana: fields("Ghana"), Nigeria: fields("Nigeria") };
}

export function AdminPricing({
  pricing,
  busy,
  onChange,
  onBusy,
}: {
  pricing: PricingSettings;
  busy: boolean;
  onChange: (snapshot: AdminSnapshot) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [form, setForm] = useState(() => pricingFields(pricing));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  const applied = useRef(JSON.stringify(pricing));
  const pricingKey = JSON.stringify(pricing);

  useEffect(() => {
    if (dirty.current || applied.current === pricingKey) return;
    applied.current = pricingKey;
    setForm(pricingFields(pricing));
  }, [pricing, pricingKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setSaved(false);
    const country = (name: (typeof COUNTRIES)[number]) => ({
      activationFee: Number(form[name].activationFee),
      packages: form[name].packages.map((pack) => ({
        id: pack.id,
        price: Number(pack.price),
        minutes: Number(pack.minutes),
      })),
    });
    onBusy(true);
    try {
      const settings = validatePricing({ Ghana: country("Ghana"), Nigeria: country("Nigeria") });
      const next = await savePricing({ data: settings });
      applied.current = JSON.stringify(next.pricing);
      dirty.current = false;
      setForm(pricingFields(next.pricing));
      onChange(next);
      bumpGateway();
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save pricing.");
    } finally {
      onBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-white/10 bg-[#111111] px-4 py-5">
      <h2 className="text-lg font-black">Session packages</h2>
      <p className="mt-2 text-sm text-[#9aa3b2]">
        One-time activation is required for both games. Saved package prices and minutes update
        customer menus and checkout; existing purchases keep their original price and duration.
      </p>
      <form className="mt-5" onSubmit={(event) => void submit(event)}>
        <fieldset disabled={busy} className="grid gap-5 disabled:opacity-60 md:grid-cols-2">
          {COUNTRIES.map((country) => {
            const currency = country === "Ghana" ? "GHS" : "NGN";
            return (
              <div key={country} className="rounded-2xl border border-white/10 p-4">
                <h3 className="font-extrabold">
                  {country} ({currency})
                </h3>
                <label className="mt-4 block text-xs font-bold text-[#9aa3b2]">
                  Activation fee ({currency})
                  <input
                    required
                    type="number"
                    min="1"
                    max="2147483647"
                    step="1"
                    value={form[country].activationFee}
                    onChange={(event) => {
                      dirty.current = true;
                      setSaved(false);
                      const value = event.target.value;
                      setForm((current) => ({
                        ...current,
                        [country]: { ...current[country], activationFee: value },
                      }));
                    }}
                    className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-sm text-white outline-none"
                  />
                </label>
                {form[country].packages.map((pack) => (
                  <div key={pack.id} className="mt-5 border-t border-white/10 pt-4">
                    <h4 className="text-sm font-extrabold">{LABELS[pack.id]}</h4>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {(["price", "minutes"] as const).map((key) => (
                        <label key={key} className="block text-xs font-bold text-[#9aa3b2]">
                          {key === "price" ? `Price (${currency})` : "Session minutes"}
                          <input
                            required
                            type="number"
                            min="1"
                            max={key === "price" ? 2147483647 : 1440}
                            step="1"
                            value={pack[key]}
                            onChange={(event) => {
                              dirty.current = true;
                              setSaved(false);
                              const value = event.target.value;
                              setForm((current) => ({
                                ...current,
                                [country]: {
                                  ...current[country],
                                  packages: current[country].packages.map((item) =>
                                    item.id === pack.id ? { ...item, [key]: value } : item,
                                  ),
                                },
                              }));
                            }}
                            className="mt-2 h-11 w-full rounded-lg border border-white/15 bg-ink px-3 text-sm text-white outline-none"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </fieldset>
        <p className="mt-3 text-xs text-[#9aa3b2]">
          Use whole-number prices and 1-1,440 minutes. Each country's package prices must be
          different.
        </p>
        {error ? (
          <p className="mt-3 text-sm text-red" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="mt-3 text-sm text-[#7ddea0]" role="status">
            Pricing saved. Customer pages will pick up the new prices and minutes.
          </p>
        ) : null}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 h-11 rounded-lg bg-red px-5 text-sm font-extrabold text-white disabled:opacity-40"
        >
          {busy ? "Saving..." : "Save prices & minutes"}
        </button>
      </form>
    </section>
  );
}
