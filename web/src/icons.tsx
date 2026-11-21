import type { ReactNode, SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size: number, p: P, children: ReactNode, vb = 24) => (
  <svg
    width={size}
    height={size}
    viewBox={`0 0 ${vb} ${vb}`}
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    {...p}
  >
    {children}
  </svg>
);

export const Arrow = ({ size = 16, ...p }: P) => base(size, p, <path d="M5 12h14M13 6l6 6-6 6" />);
export const ArrowDown = ({ size = 12, ...p }: P) => base(size, p, <path d="M12 5v14M6 13l6 6 6-6" />);
export const ArrowUpRight = ({ size = 16, ...p }: P) => base(size, p, <path d="M7 17 17 7M8 7h9v9" />);
export const Chevron = ({ size = 20, ...p }: P) => base(size, p, <path d="m6 9 6 6 6-6" />);
export const Check = ({ size = 16, ...p }: P) => base(size, p, <path d="m5 12.5 4.5 4.5L19 7.5" />);
export const Copy = ({ size = 16, ...p }: P) =>
  base(
    size,
    p,
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.5" />
      <path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" />
    </>,
  );
export const Play = ({ size = 16, ...p }: P) => base(size, p, <path d="M8 5.5v13l10.5-6.5L8 5.5Z" />);
export const Menu = ({ size = 20, ...p }: P) => base(size, p, <path d="M5 8h14M5 12h10M5 16h14" />);
export const CheckCircle = ({ size = 14, ...p }: P) =>
  base(
    size,
    { ...p, stroke: "none" },
    <>
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="m7.5 12.5 3 3 6-6.5" stroke="#fff" strokeWidth="2" fill="none" />
    </>,
  );
export const Clock = ({ size = 20, ...p }: P) =>
  base(
    size,
    p,
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2M9.5 2.5h5" />
    </>,
  );
export const Flag = ({ size = 20, ...p }: P) => base(size, p, <path d="M5 21V4m0 1h11l-2 4 2 4H5" />);
export const Archive = ({ size = 20, ...p }: P) =>
  base(
    size,
    p,
    <>
      <rect x="3" y="4" width="18" height="5" rx="1.5" />
      <path d="M5 9v9.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V9M10 13h4" />
    </>,
  );
export const Shield = ({ size = 20, ...p }: P) =>
  base(
    size,
    p,
    <>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.1 8 7.5 9.5 4.4-1.500 7.5-4.900 7.5-9.500V6L12 3Z" />
      <path d="m9.500 9.500 5 5m0-5-5 5" />
    </>,
  );
export const Sun = ({ size = 20, ...p }: P) =>
  base(
    size,
    p,
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.600 5.600 7 7M17 17l1.400 1.400M5.600 18.400 7 17M17 7l1.400-1.400" />
    </>,
  );
export const GitHub = ({ size = 20, ...p }: P) =>
  base(
    size,
    { ...p, stroke: "none", fill: "currentColor" },
    <path d="M12 2a10 10 0 0 0-3.160 19.490c.5.090.680-.220.680-.480v-1.700c-2.780.600-3.370-1.340-3.370-1.340-.450-1.160-1.110-1.470-1.110-1.470-.910-.620.070-.600.070-.600 1 .070 1.530 1.030 1.530 1.030.890 1.530 2.340 1.090 2.910.830.090-.650.350-1.090.630-1.340-2.220-.250-4.550-1.110-4.550-4.940 0-1.090.390-1.980 1.030-2.680-.100-.250-.450-1.270.100-2.650 0 0 .840-.270 2.750 1.020a9.560 9.560 0 0 1 5 0c1.910-1.290 2.750-1.020 2.750-1.020.550 1.380.200 2.400.100 2.650.640.700 1.030 1.590 1.030 2.680 0 3.840-2.340 4.680-4.570 4.930.360.310.680.920.680 1.850v2.750c0 .270.180.580.690.480A10 10 0 0 0 12 2Z" />,
  );
export const LinkIcon = ({ size = 20, ...p }: P) =>
  base(
    size,
    p,
    <path d="M10 14a4 4 0 0 0 5.660 0l3-3a4 4 0 0 0-5.660-5.660l-1 1M14 10a4 4 0 0 0-5.660 0l-3 3a4 4 0 0 0 5.660 5.660l1-1" />,
  );
export const Cube = ({ size = 20, ...p }: P) =>
  base(
    size,
    p,
    <path d="m12 3 8 4.500v9L12 21l-8-4.500v-9L12 3Zm0 9 8-4.500M12 12v9m0-9L4 7.500" />,
  );

/** The Standby mark: two waiting, one going. */
export const Mark = () => (
  <svg width="18" height="18" viewBox="5 5 18 18" aria-hidden>
    <circle cx="8.5" cy="14" r="2.5" fill="#fff" opacity=".45" />
    <circle cx="14" cy="14" r="2.5" fill="#fff" opacity=".7" />
    <path
      d="M18.2 10.2 22 14l-3.8 3.8"
      fill="none"
      stroke="#fff"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const Token = ({ k, sm }: { k: "usd" | "base" | "lasna" | "queue" | "morpho" | "ink"; sm?: boolean }) => {
  const map = {
    usd: ["#0e8c86", "$"],
    base: ["#2468f0", "B"],
    lasna: ["#7c5cfa", "R"],
    queue: ["#111113", "Q"],
    morpho: ["#2468f0", "M"],
    ink: ["#111113", "L"],
  } as const;
  const [bg, ch] = map[k];
  return (
    <span className={sm ? "tok sm" : "tok"} style={{ background: bg }} aria-hidden>
      {ch}
    </span>
  );
};
