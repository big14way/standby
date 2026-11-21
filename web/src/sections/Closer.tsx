import { useEffect, useRef, useState } from "react";

import { GitHub, LinkIcon, Mark, Check, Copy, Cube, Sun } from "../icons";
import { BASESCAN, MORPHO, QUEUE, REACTSCAN, REPO, TRY_IT, WATCHER, palette, reducedMotion } from "../lib";
import { Reveal, Words } from "../reveal";

const CHARS = "0123456789abcdefx0123456789.,_$";
const COL = 40;
const ROW = 18;

/** Columns of hash characters drifting down, thinner where the heading sits. */
function Field() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const ctx = el.getContext("2d")!;
    let w = 0;
    let h = 0;
    let raf = 0;
    let pal = palette();
    type Drop = { x: number; y: number; v: number; chars: string[]; a: number };
    let drops: Drop[] = [];
    const pick = () => CHARS[Math.floor(Math.random() * CHARS.length)];
    const seed = () => {
      drops = [];
      for (let x = COL / 2; x < w; x += COL) {
        const n = Math.random() < 0.75 ? 1 + Math.floor(Math.random() * 2) : 0;
        for (let k = 0; k < n; k++)
          drops.push({
            x: x + (Math.random() < 0.3 ? 20 : 0),
            y: Math.random() * h,
            v: 4 + Math.random() * 9,
            chars: Array.from({ length: 3 + Math.floor(Math.random() * 6) }, pick),
            a: 0.25 + Math.random() * 0.6,
          });
      }
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const mo = new MutationObserver(() => (pal = palette()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const still = reducedMotion();
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.font = '500 13px "Geist Mono Variable", ui-monospace, monospace';
      ctx.textAlign = "center";
      ctx.fillStyle = pal.blue;
      for (const d of drops) {
        d.y += d.v * dt;
        if (d.y - d.chars.length * ROW > h) d.y = -ROW;
        if (Math.random() < 0.004) d.chars[Math.floor(Math.random() * d.chars.length)] = pick();
        d.chars.forEach((c, i) => {
          const y = d.y - (d.chars.length - 1 - i) * ROW;
          // Quiet behind the heading and the buttons.
          const nx = Math.abs(d.x / w - 0.5) / 0.5;
          const ny = Math.abs(y / h - 0.5) / 0.5;
          const hush = nx < 0.62 && ny < 0.36 ? 0.08 : 1;
          const edge = Math.min(1, y / 50, (h - y) / 70);
          const tail = 0.35 + 0.65 * (i / Math.max(1, d.chars.length - 1));
          ctx.globalAlpha = Math.max(0, d.a * tail * edge * hush * 0.85);
          ctx.fillText(c, d.x, y);
        });
      }
      ctx.globalAlpha = 1;
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return <canvas ref={ref} aria-hidden />;
}

export function Closer() {
  return (
    <section className="closer">
      <Field />
      <div className="inner">
        <Words parts={["Ready when", { dim: "the liquidity is." }]} />
        <Reveal delay={0.2}>
          <div className="ctas">
            <a className="btn btn-ink" href="#try">
              Try it live
            </a>
            <a className="btn btn-grey" href={REPO} target="_blank" rel="noreferrer">
              View the code
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

const ext = { target: "_blank", rel: "noreferrer" } as const;

export function Footer() {
  const [copied, setCopied] = useState(false);
  const toggle = () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("standby-theme", root.dataset.theme);
    } catch {
      // Private windows: the choice lasts for this visit only.
    }
  };
  return (
    <footer className="footer">
      <div className="horizon" />
      <div className="foot-inner">
        <div className="foot-top">
          <div className="foot-brand">
            <a className="logo" href="#top">
              <span className="mark">
                <Mark />
              </span>
              Standby
            </a>
            <div>
              <p className="lbl">The queue on Base Sepolia</p>
              <div className="copy-field">
                <output>{QUEUE}</output>
                <button
                  type="button"
                  className="btn btn-grey"
                  onClick={() =>
                    navigator.clipboard?.writeText(QUEUE).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1600);
                    })
                  }
                >
                  {copied ? <Check /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          </div>
          <div className="foot-cols">
            <div>
              <b>Contracts</b>
              <a href={`${BASESCAN}/address/${QUEUE}`} {...ext}>
                StandbyQueue
              </a>
              <a href={`${REACTSCAN}/address/${WATCHER}`} {...ext}>
                StandbyWatcher
              </a>
              <a href={`${BASESCAN}/address/${TRY_IT}`} {...ext}>
                TryIt
              </a>
              <a href={`${BASESCAN}/address/${MORPHO}`} {...ext}>
                Morpho Blue
              </a>
            </div>
            <div>
              <b>Evidence</b>
              <a href="#latency">Latency</a>
              <a href="#race">The race</a>
              <a href={`${REPO}#what-history-says-about-freed-liquidity`} {...ext}>
                History
              </a>
              <a href={`${REPO}#refusals-on-chain`} {...ext}>
                Refusals
              </a>
              <a href={`${REPO}#limits`} {...ext}>
                Limits
              </a>
            </div>
            <div>
              <b>Build</b>
              <a href={REPO} {...ext}>
                Source
              </a>
              <a href={`${REPO}/tree/main/test`} {...ext}>
                Tests
              </a>
              <a href={`${REPO}/tree/main/measure`} {...ext}>
                Harness
              </a>
              <a href={`${REPO}/tree/main/data`} {...ext}>
                Loop data
              </a>
            </div>
            <div>
              <b>Verified</b>
              <a href={`https://repo.sourcify.dev/84532/${QUEUE}`} {...ext}>
                Queue source
              </a>
              <a href={`https://repo.sourcify.dev/5318007/${WATCHER}`} {...ext}>
                Watcher source
              </a>
              <a href={`https://repo.sourcify.dev/84532/${TRY_IT}`} {...ext}>
                TryIt source
              </a>
            </div>
          </div>
        </div>
        <div className="foot-base">
          <span>© 2026 Standby. MIT. A testnet demo; the contracts are not audited.</span>
          <div className="socials">
            <a href={REPO} aria-label="GitHub" {...ext}>
              <GitHub />
            </a>
            <a href={`${BASESCAN}/address/${QUEUE}`} aria-label="The queue on Basescan" {...ext}>
              <Cube />
            </a>
            <a href={`https://repo.sourcify.dev/84532/${QUEUE}`} aria-label="Verified source on Sourcify" {...ext}>
              <LinkIcon />
            </a>
            <button type="button" aria-label="Switch between light and dark" onClick={toggle}>
              <Sun />
            </button>
          </div>
        </div>
      </div>
      <div className="wordmark-crop" aria-hidden>
        <p>Standby</p>
      </div>
    </footer>
  );
}
