export function PaymentPayerField({
  value,
  onChange,
  bankTransfer,
}: {
  value: string;
  onChange: (value: string) => void;
  bankTransfer: boolean;
}) {
  return (
    <label className="mt-4 block text-xs font-extrabold tracking-wide text-white">
      {bankTransfer ? "NAME ON YOUR BANK ACCOUNT" : "NAME ON YOUR MOMO ACCOUNT"}
      <input
        name="payerName"
        type="text"
        required
        maxLength={100}
        autoComplete="name"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={
          bankTransfer
            ? "Enter the name on the bank account you paid from"
            : "Enter the name on the MoMo account you paid from"
        }
        className="mt-2 w-full rounded-xl border border-white/15 bg-black px-3 py-3 text-sm font-normal tracking-normal text-white placeholder:text-white/40 focus:border-red focus:outline-none"
      />
    </label>
  );
}
