/* The illustrations on the cards. Drawn for this page; the numbers in them are the measured ones. */

const Shadow = ({ cx, cy, rx }: { cx: number; cy: number; rx: number }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.09} fill="#111113" opacity="0.1" filter="url(#soft)" />
);

const Defs = ({ id }: { id: string }) => (
  <defs>
    <filter id="soft" x="-50%" y="-200%" width="200%" height="500%">
      <feGaussianBlur stdDeviation="7" />
    </filter>
    <linearGradient id={`${id}-plate`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#ffffff" />
      <stop offset="1" stopColor="#e6e6ea" />
    </linearGradient>
    <linearGradient id={`${id}-rim`} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stopColor="#fdfdfe" />
      <stop offset="1" stopColor="#cfcfd6" />
    </linearGradient>
    <linearGradient id={`${id}-dark`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#3a3a40" />
      <stop offset="1" stopColor="#141416" />
    </linearGradient>
    <linearGradient id={`${id}-blue`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#5a90ff" />
      <stop offset="1" stopColor="#1f5be0" />
    </linearGradient>
  </defs>
);

const mono = { fontFamily: "var(--mono)", fontWeight: 500 } as const;

/** Latency: a stopwatch whose dial runs 0 to 4 s, hand at the median, band from fastest to p99. */
export function Stopwatch() {
  const C = [240, 148] as const;
  const at = (s: number, r: number) => {
    const a = ((s / 4) * 360 - 90) * (Math.PI / 180);
    return [C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r];
  };
  const arc = (s0: number, s1: number, r: number) => {
    const [x0, y0] = at(s0, r);
    const [x1, y1] = at(s1, r);
    return `M${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}`;
  };
  return (
    <svg viewBox="0 0 480 280" role="img" aria-label="A stopwatch reading 1.4 seconds">
      <Defs id="sw" />
      <Shadow cx={240} cy={262} rx={110} />
      <rect x="229" y="22" width="22" height="26" rx="5" fill="url(#sw-rim)" stroke="#c9c9d0" />
      <rect x="222" y="16" width="36" height="12" rx="4" fill="url(#sw-dark)" />
      <rect x="318" y="50" width="20" height="16" rx="4" transform="rotate(42 328 58)" fill="url(#sw-rim)" stroke="#c9c9d0" />
      <circle cx={C[0]} cy={C[1]} r="104" fill="url(#sw-rim)" />
      <circle cx={C[0]} cy={C[1]} r="92" fill="url(#sw-plate)" stroke="#dcdce2" />
      <circle cx={C[0]} cy={C[1]} r="58" fill="none" stroke="#e3e3e8" />
      {Array.from({ length: 40 }, (_, i) => {
        const major = i % 10 === 0;
        const [x0, y0] = at(i / 10, major ? 76 : 80);
        const [x1, y1] = at(i / 10, 86);
        return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke={major ? "#55555c" : "#b9b9c1"} strokeWidth={major ? 2 : 1} strokeLinecap="round" />;
      })}
      {[0, 1, 2, 3].map((s) => {
        const [x, y] = at(s, 66);
        return (
          <text key={s} x={x} y={y + 4} textAnchor="middle" fontSize="11" fill="#6b6b74" style={mono}>
            {s}
          </text>
        );
      })}
      <path className="draw" pathLength={1} d={arc(0.8, 2.0, 86)} fill="none" stroke="#2468f0" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
      <g className="hand" style={{ ["--to" as string]: "126deg", transformOrigin: `${C[0]}px ${C[1]}px` }}>
        <path d={`M${C[0] - 3} ${C[1] + 16}L${C[0]} ${C[1] - 78}L${C[0] + 3} ${C[1] + 16}Z`} fill="#111113" />
      </g>
      <circle cx={C[0]} cy={C[1]} r="11" fill="url(#sw-blue)" stroke="#fff" strokeWidth="2" />
      <text x={C[0]} y={C[1] + 44} textAnchor="middle" fontSize="12" fill="#111113" style={{ ...mono, fontWeight: 700 }}>
        1.4 s
      </text>
      <text x={C[0]} y={C[1] - 30} textAnchor="middle" fontSize="8" letterSpacing="1" fill="#8a8a93" style={mono}>
        MEDIAN
      </text>
    </svg>
  );
}

/** The race: the queue's payment and a rival's withdrawal run for the same liquidity. */
export function Track() {
  return (
    <svg viewBox="0 0 480 280" role="img" aria-label="Two lanes; the queue reaches the line before a rival who needs two seconds">
      <Defs id="tr" />
      <Shadow cx={240} cy={250} rx={190} />
      <rect x="48" y="62" width="384" height="170" rx="18" fill="url(#tr-rim)" />
      <rect x="56" y="70" width="368" height="154" rx="12" fill="url(#tr-plate)" stroke="#dcdce2" />
      <line x1="72" y1="147" x2="408" y2="147" stroke="#c9c9d0" strokeDasharray="6 7" />
      {Array.from({ length: 11 }, (_, r) =>
        [0, 1].map((c) => (
          <rect key={`${r}${c}`} x={352 + c * 7} y={70 + r * 14} width="7" height="14" fill={(r + c) % 2 ? "#111113" : "#fff"} opacity="0.85" />
        )),
      )}
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <line x1={96 + i * 64} y1="76" x2={96 + i * 64} y2="84" stroke="#b9b9c1" />
          <text x={96 + i * 64} y="98" textAnchor="middle" fontSize="9" fill="#8a8a93" style={mono}>
            {(i * 0.5).toFixed(1)} s
          </text>
        </g>
      ))}
      <g className="slide" style={{ ["--from" as string]: "-250px" }}>
        <circle cx="386" cy="118" r="20" fill="url(#tr-blue)" stroke="#fff" strokeWidth="2.500" />
        <text x="386" y="122" textAnchor="middle" fontSize="10" fill="#fff" style={{ ...mono, fontWeight: 700 }}>
          QUEUE
        </text>
      </g>
      <g className="slide slow" style={{ ["--from" as string]: "-150px" }}>
        <circle cx="266" cy="186" r="20" fill="url(#tr-dark)" stroke="#fff" strokeWidth="2.500" />
        <text x="266" y="190" textAnchor="middle" fontSize="10" fill="#fff" style={{ ...mono, fontWeight: 700 }}>
          RIVAL
        </text>
      </g>
      <text x="76" y="212" fontSize="9" letterSpacing="0.8" fill="#8a8a93" style={mono}>
        41 / 41 AT 2.0 S AND BEYOND
      </text>
    </svg>
  );
}

/** History: the five markets and the inflows found in each. */
export function Sheets() {
  const rows = [
    ["USR / USDC", "Ethereum", "452"],
    ["wstUSR / USDC", "Ethereum", "243"],
    ["sdeUSD / USDC", "Ethereum", "249"],
    ["deUSD / USDC", "Ethereum", "22"],
    ["USR / USDC", "Base", "313"],
  ];
  return (
    <svg viewBox="0 0 480 280" role="img" aria-label="A ledger of five markets and 1,279 inflows">
      <Defs id="sh" />
      <Shadow cx={240} cy={258} rx={170} />
      <rect x="112" y="36" width="270" height="206" rx="12" fill="#e9e9ee" stroke="#d6d6dc" transform="rotate(5 247 139)" />
      <rect x="104" y="34" width="270" height="206" rx="12" fill="#f3f3f6" stroke="#dcdce2" transform="rotate(2 239 137)" />
      <rect x="96" y="30" width="270" height="210" rx="12" fill="url(#sh-plate)" stroke="#dcdce2" />
      <rect x="96" y="30" width="270" height="34" rx="12" fill="#f0f0f3" />
      <text x="112" y="52" fontSize="9" letterSpacing="0.9" fill="#6b6b74" style={mono}>
        FULL MARKET
      </text>
      <text x="350" y="52" textAnchor="end" fontSize="9" letterSpacing="0.9" fill="#6b6b74" style={mono}>
        INFLOWS
      </text>
      {rows.map(([m, c, n], i) => (
        <g key={i} className="row" style={{ ["--i" as string]: i }}>
          <line x1="112" y1={64 + i * 28} x2="350" y2={64 + i * 28} stroke="#e6e6ea" />
          <text x="112" y={83 + i * 28} fontSize="11" fill="#111113" style={mono}>
            {m}
          </text>
          <text x="230" y={83 + i * 28} fontSize="9" fill="#8a8a93" style={mono}>
            {c}
          </text>
          <text x="350" y={83 + i * 28} textAnchor="end" fontSize="11" fill="#52525a" style={mono}>
            {n}
          </text>
        </g>
      ))}
      <g className="row" style={{ ["--i" as string]: 5 }}>
        <rect x="104" y="206" width="254" height="26" rx="6" fill="#2468f0" opacity="0.12" />
        <rect x="104" y="206" width="3" height="26" rx="1.500" fill="#2468f0" />
        <text x="116" y="223" fontSize="11" fill="#1d5bd8" style={{ ...mono, fontWeight: 700 }}>
          All five
        </text>
        <text x="350" y="223" textAnchor="end" fontSize="11" fill="#1d5bd8" style={{ ...mono, fontWeight: 700 }}>
          1,279
        </text>
      </g>
    </svg>
  );
}

/** Refusals: a callback nobody asked for, stopped at the barrier. */
export function Barrier() {
  return (
    <svg viewBox="0 0 480 280" role="img" aria-label="A barrier turning away a callback from another contract">
      <Defs id="ba" />
      <Shadow cx={250} cy={252} rx={180} />
      <rect x="92" y="226" width="300" height="16" rx="8" fill="url(#ba-rim)" stroke="#d6d6dc" />
      <rect x="118" y="86" width="34" height="146" rx="9" fill="url(#ba-dark)" />
      <circle cx="135" cy="104" r="7" fill="#f97066" className="lamp" />
      <circle cx="135" cy="126" r="7" fill="#3a3a40" />
      <g className="arm" style={{ transformOrigin: "135px 152px" }}>
        <rect x="135" y="143" width="250" height="18" rx="9" fill="url(#ba-plate)" stroke="#d0d0d7" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M${176 + i * 44} 144h18l-12 16h-18z`} fill="#2468f0" opacity="0.85" />
        ))}
        <circle cx="135" cy="152" r="13" fill="url(#ba-rim)" stroke="#c9c9d0" />
        <circle cx="135" cy="152" r="4" fill="#55555c" />
      </g>
      <g className="bump">
        <rect x="270" y="176" width="112" height="46" rx="8" fill="#fff" stroke="#d6d6dc" transform="rotate(-7 326 199)" />
        <g transform="rotate(-7 326 199)">
          <text x="282" y="194" fontSize="8" letterSpacing="0.8" fill="#8a8a93" style={mono}>
            CALLBACK FROM
          </text>
          <text x="282" y="210" fontSize="11" fill="#111113" style={{ ...mono, fontWeight: 700 }}>
            0xC0BA…8642
          </text>
        </g>
      </g>
      <g>
        <rect x="262" y="92" width="96" height="26" rx="13" fill="#111113" />
        <circle cx="278" cy="105" r="3.500" fill="#f97066" />
        <text x="290" y="109" fontSize="10" letterSpacing="0.8" fill="#fff" style={mono}>
          REFUSED
        </text>
      </g>
    </svg>
  );
}

/** Verified source: a code window with a seal. */
export function Source() {
  const lines = [38, 96, 74, 110, 58, 88];
  return (
    <svg viewBox="0 0 300 160" role="img" aria-label="A source file with a verification seal">
      <Defs id="so" />
      <Shadow cx={150} cy={150} rx={96} />
      <rect x="62" y="14" width="176" height="124" rx="12" fill="url(#so-plate)" stroke="#dcdce2" />
      <rect x="62" y="14" width="176" height="24" rx="12" fill="#f0f0f3" />
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={78 + i * 11} cy="26" r="3" fill="#cfcfd6" />
      ))}
      <text x="226" y="30" textAnchor="end" fontSize="8" letterSpacing="0.6" fill="#8a8a93" style={mono}>
        EXACT MATCH
      </text>
      {lines.map((w, i) => (
        <rect key={i} className="row" style={{ ["--i" as string]: i }} x={i % 3 === 0 ? 78 : 90} y={50 + i * 14} width={w} height="5" rx="2.500" fill={i === 3 ? "#2468f0" : "#d6d6dc"} opacity={i === 3 ? 0.7 : 1} />
      ))}
      <g className="pop" style={{ transformOrigin: "222px 118px" }}>
        <circle cx="222" cy="118" r="24" fill="url(#so-dark)" stroke="#fff" strokeWidth="3" />
        <path d="m212 118.500 7 7 13-14" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Tested: one square for each of the 42 tests. */
export function Tests() {
  return (
    <svg viewBox="0 0 300 160" role="img" aria-label="42 of 42 tests passing">
      <Defs id="te" />
      <Shadow cx={150} cy={150} rx={96} />
      <rect x="58" y="12" width="184" height="128" rx="14" fill="url(#te-plate)" stroke="#dcdce2" />
      {Array.from({ length: 42 }, (_, i) => (
        <rect key={i} className="row" style={{ ["--i" as string]: i * 0.12 }} x={75 + (i % 7) * 22} y={26 + Math.floor(i / 7) * 14} width="17" height="9" rx="3" fill={i === 41 ? "#2468f0" : "#12b76a"} opacity={i === 41 ? 1 : 0.55 + ((i * 7) % 5) * 0.09} />
      ))}
      <text x="150" y="128" textAnchor="middle" fontSize="12" fill="#111113" style={{ ...mono, fontWeight: 700 }}>
        42 / 42
      </text>
    </svg>
  );
}

/** Your position: the authorisation is a switch the lender holds. */
export function Switch() {
  return (
    <svg viewBox="0 0 300 160" role="img" aria-label="A switch: the lender can revoke the queue at any time">
      <Defs id="sw2" />
      <Shadow cx={150} cy={150} rx={96} />
      <rect x="66" y="16" width="168" height="120" rx="22" fill="url(#sw2-dark)" />
      <rect x="72" y="22" width="156" height="108" rx="17" fill="none" stroke="#4a4a52" />
      <rect x="96" y="46" width="108" height="48" rx="24" fill="#0c0c0e" stroke="#2a2a2e" />
      <rect x="100" y="50" width="100" height="40" rx="20" fill="#2468f0" opacity="0.9" className="glow" />
      <g className="knob">
        <circle cx="180" cy="70" r="18" fill="url(#sw2-rim)" stroke="#fff" strokeWidth="1.500" />
        <circle cx="180" cy="70" r="6" fill="none" stroke="#b9b9c1" strokeWidth="1.500" />
      </g>
      <text x="150" y="116" textAnchor="middle" fontSize="8" letterSpacing="1" fill="#a0a0ab" style={mono}>
        AUTHORISED · REVOCABLE
      </text>
    </svg>
  );
}
