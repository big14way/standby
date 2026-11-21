import { animate, useInView } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { BLOCK_S, data, reducedMotion } from "../lib";
import { EASE, Reveal, Words } from "../reveal";

const PLOT_H = 320;
const TOP = 34; // where 100% sits
const X0 = 0.6;
const X1 = 3.6;
const TOTAL = data.blocks.n;

/** Share of loops settled by each block count: the points of the curve. */
const POINTS = (() => {
  const keys = Object.keys(data.histogram)
    .map(Number)
    .sort((a, b) => a - b);
  let sum = 0;
  const out = [{ s: X0, n: 0, blocks: 0 }];
  for (const k of keys) {
    // Flat until this block count, then the step up.
    sum += data.histogram[String(k)];
    out.push({ s: k * BLOCK_S, n: sum, blocks: k });
  }
  return out;
})();

function CountUp({ to, decimals = 0 }: { to: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true });
  useEffect(() => {
    if (!seen) return;
    if (reducedMotion()) {
      ref.current!.textContent = to.toFixed(decimals);
      return;
    }
    const c = animate(0, to, {
      duration: 1.4,
      ease: EASE,
      onUpdate: (v) => ref.current && (ref.current.textContent = v.toFixed(decimals)),
    });
    return () => c.stop();
  }, [seen, to, decimals]);
  return <b ref={ref}>{(0).toFixed(decimals)}</b>;
}

const Glyph = ({ k }: { k: number }) => (
  <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    {k === 0 && <path d="M4 16V8l7 5 7-5v8" />}
    {k === 1 && <circle cx="11" cy="11" r="7" />}
    {k === 2 && <path d="M11 3 18 7v8l-7 4-7-4V7l7-4Z" />}
    {k === 3 && <path d="M5 17 13 9m2-5 3 3-3 3-3-3 3-3Z" />}
    {k === 4 && <path d="m5 11.500 4 4 8-9" />}
    {k === 5 && <path d="M8 5 4 11l4 6m6-12 4 6-4 6" />}
  </svg>
);
const STACK: [string, string][] = [
  ["Morpho", "Blue"],
  ["Base", "Sepolia"],
  ["Reactive", "Lasna"],
  ["Foundry", ""],
  ["Sourcify", ""],
  ["Solidity", "0.8.30"],
];

function Chart() {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(1200);
  const seen = useInView(box, { once: true, amount: 0.4 });
  const [hover, setHover] = useState<number | null>(null);
  const still = reducedMotion();

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = w < 600 ? 240 : PLOT_H;
  const x = (s: number) => ((s - X0) / (X1 - X0)) * w;
  const y = (n: number) => h - (n / TOTAL) * (h - TOP);
  const { line, area } = useMemo(() => {
    const pts = POINTS.map((p) => `${x(p.s).toFixed(1)} ${y(p.n).toFixed(1)}`);
    const l = `M${pts.join("L")}`;
    return { line: l, area: `${l}L${x(POINTS[POINTS.length - 1].s)} ${h}L0 ${h}Z` };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);
  const end = POINTS[POINTS.length - 1];
  const ticks = [0.6, 0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2];
  const hp = hover === null ? null : POINTS[hover];

  const onMove = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    const s = X0 + ((e.clientX - r.left) / r.width) * (X1 - X0);
    let best = 1;
    for (let i = 1; i < POINTS.length; i++) if (Math.abs(POINTS[i].s - s) < Math.abs(POINTS[best].s - s)) best = i;
    setHover(best);
  };

  return (
    <figure className="chart">
      <figcaption>
        <span>
          <i />
          Share of {TOTAL} loops settled, by time after the repayment
        </span>
        <span>Base Sepolia · 20 Nov 2026</span>
      </figcaption>
      <div className="plot" ref={box} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[25, 50, 75, 100].map((p) => (
          <div key={p} className="gl" style={{ top: y((p / 100) * TOTAL) }}>
            <span>{p}%</span>
          </div>
        ))}
        <div className="axis" style={{ top: h }} />
        {ticks.map((t) => (
          <div key={t} className="tick" style={{ left: x(t), top: h + 1 }}>
            <span>{t.toFixed(1)} s</span>
          </div>
        ))}
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ height: h }} aria-hidden>
          <defs>
            <pattern id="dots" width="4" height="4" patternUnits="userSpaceOnUse">
              <rect width="1.200" height="1.200" fill="var(--blue)" />
            </pattern>
            <linearGradient id="fall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </linearGradient>
            <mask id="fade">
              <rect width={w} height={h} fill="url(#fall)" />
            </mask>
            <clipPath id="wipe">
              <rect
                width={w}
                height={h + 10}
                y={-5}
                style={{
                  transform: seen || still ? "scaleX(1)" : "scaleX(0)",
                  transition: still ? "none" : "transform 1.8s cubic-bezier(0.7, 0, 0.2, 1)",
                }}
              />
            </clipPath>
          </defs>
          <g clipPath="url(#wipe)">
            <g mask="url(#fade)">
              <path d={area} fill="url(#dots)" />
            </g>
            <path d={line} fill="none" stroke="var(--blue)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        </svg>
        <div
          className="end"
          style={{
            left: x(end.s),
            top: y(end.n),
            opacity: seen || still ? 1 : 0,
            transform: seen || still ? "none" : "scale(0.4)",
            transition: "opacity 0.4s 1.7s, transform 0.4s var(--ease) 1.7s",
          }}
        />
        <div
          className="tip"
          style={{
            left: Math.min(x(end.s) - 56, w - 122),
            top: y(end.n) - 34,
            opacity: (seen || still) && hover === null ? 1 : 0,
            transform: seen || still ? "none" : "translateY(4px)",
            transition: "opacity 0.3s 1.8s, transform 0.4s var(--ease) 1.8s",
          }}
        >
          220 of 220 · 3.4 s
        </div>
        {hp && (
          <>
            <div className="cross" style={{ left: x(hp.s), height: h }}>
              <i style={{ top: y(hp.n) }} />
            </div>
            <div
              className="tip big"
              style={
                x(hp.s) > w - 220
                  ? { right: w - x(hp.s) + 16, top: Math.max(0, y(hp.n) - 24) }
                  : { left: x(hp.s) + 16, top: Math.max(0, y(hp.n) - 24) }
              }
            >
              <b>
                within {hp.s.toFixed(1)} s ({hp.blocks} blocks)
              </b>
              {hp.n} of {TOTAL} loops, {((hp.n / TOTAL) * 100).toFixed(hp.n === TOTAL ? 0 : 1)}%
            </div>
          </>
        )}
        <p className="sr">
          Of {TOTAL} measured loops, {POINTS.slice(1)
            .map((p) => `${p.n} had settled within ${p.s.toFixed(1)} seconds`)
            .join(", ")}
          .
        </p>
      </div>
    </figure>
  );
}

export function Proof() {
  return (
    <section className="section proof" id="latency">
      <div className="container">
        <Words
          parts={[
            "220 loops, read back from both chains",
            { dim: "— repayments and supplies, all paid in full." },
          ]}
        />
        <Reveal delay={0.15}>
          <div className="stack-names">
            {STACK.map(([a, b], i) => (
              <span key={a}>
                <Glyph k={i} />
                <span>
                  <b>{a}</b> {b}
                </span>
              </span>
            ))}
          </div>
        </Reveal>
        <div className="chart-wrap">
          <Reveal>
            <dl className="stats">
              <div>
                <dt>Median, repayment to lender paid</dt>
                <dd>
                  <CountUp to={data.blocks.median * BLOCK_S} decimals={1} />
                  <small>s</small>
                </dd>
              </div>
              <div>
                <dt>Loops measured and verified</dt>
                <dd>
                  <CountUp to={TOTAL} />
                </dd>
              </div>
              <div>
                <dt>99th percentile</dt>
                <dd>
                  <CountUp to={data.blocks.p99 * BLOCK_S} decimals={1} />
                  <small>s</small>
                </dd>
              </div>
            </dl>
          </Reveal>
          <Reveal delay={0.1} style={{ marginTop: 56 }}>
            <Chart />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
