import { useId } from "react";

export function AviatorBrandMark({ className }: { className: string }) {
  const id = useId().replace(/:/g, "");
  const metalId = `plane-metal-${id}`;
  const redId = `plane-red-${id}`;

  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none">
        <defs>
          <linearGradient id={metalId} x1="12" y1="9" x2="34" y2="39" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFFFFF" />
            <stop offset=".38" stopColor="#D9DDE5" />
            <stop offset=".72" stopColor="#8D96A5" />
            <stop offset="1" stopColor="#E50914" />
          </linearGradient>
          <linearGradient id={redId} x1="14" y1="30" x2="34" y2="15" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A71922" />
            <stop offset="1" stopColor="#F24A4F" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="24" r="22" fill="#110D11" stroke="#6D2328" strokeWidth="1.25" />
        <circle cx="24" cy="24" r="18.5" stroke="rgba(229,9,20,.3)" strokeWidth=".7" />
        <path
          d="M22.15 39.1V23.7L8.7 31.1l-.9-3.4 13.2-11.1V11.4c0-4.25 1.3-7.1 3-7.1s3 2.85 3 7.1v5.2l13.2 11.1-.9 3.4-13.45-7.4v15.4l4.2 3.5v1.2L24 42.1l-5.05 1.7v-1.2l3.2-3.5Z"
          fill={`url(#${metalId})`}
          stroke="#FFFFFF"
          strokeWidth=".65"
          strokeLinejoin="round"
        />
        <path d="m24 5.7-.55 11.15h1.1L24 5.7Z" fill="#FFFFFF" opacity=".9" />
        <path d="m11 29.1 10-8.3v2l-8.9 5.8L11 29.1Zm26 0-10-8.3v2l8.9 5.8 1.1.5Z" fill={`url(#${redId})`} />
        <path d="M22.2 17.9h3.6v4.2h-3.6z" fill="#222833" stroke="#E50914" strokeWidth=".45" />
        <path d="M22.15 34.8h3.7" stroke="#7B1D24" strokeWidth=".7" />
        <path d="M22 39.1h4" stroke="#FFFFFF" strokeWidth=".55" />
      </svg>
    </span>
  );
}
