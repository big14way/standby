import { useEffect, useRef, useState } from "react";

import { type Loop, data, num, palette, reducedMotion, secs, short } from "../lib";

/** The drawing is laid out on a 728 x 728 field and scaled to the canvas height. */
const FIELD = 728;
const GRID = 96;

type Node = { id: string; x: number; y: number; w: number; h: number; label?: [number, number] };
// Borrower repays on Morpho, the watcher on Lasna reacts, the queue pays the lender.
const NODES: Node[] = [
  { id: "BORROWER", x: 70, y: 432, w: 64, h: 34, label: [28, 398] },
  { id: "MORPHO", x: 228, y: 272, w: 150, h: 62, label: [150, 214] },
  { id: "LASNA", x: 596, y: 184, w: 72, h: 46, label: [520, 132] },
  { id: "QUEUE", x: 500, y: 590, w: 440, h: 150, label: [300, 470] },
  { id: "LENDER", x: 664, y: 380, w: 52, h: 34, label: [624, 346] },
];
const LEGS: [number, number, number][] = [
  // from, to, how far the curve bows (px, to the left of travel)
  [0, 1, -28],
  [1, 2, -70],
  [2, 3, -60],
  [3, 4, 50],
];
// Seconds: when each leg starts and ends, then hold and fade.
const T_LEG = [0.3, 1.2, 2.6, 4.0, 4.8];
const T_HOLD = 6.6;
const T_END = 7.3;

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Bar = { x: number; top: number; bot: number; whisk: number; cuts: number[]; core: [number, number] };
function bars(n: Node, seed: number): Bar[] {
  const r = rng(seed);
  const out: Bar[] = [];
  for (let x = -n.w / 2; x <= n.w / 2; x += 5) {
    const e = Math.sqrt(Math.max(0, 1 - (x / (n.w / 2)) ** 2));
    const wob = 0.55 + 0.45 * Math.sin(x * 0.045 + seed) ** 2;
    const up = n.h * e * wob * (0.55 + r() * 0.6);
    const down = n.h * e * (0.3 + r() * 0.35);
    if (up + down < 5) continue;
    const cuts: number[] = [];
    for (let c = 0; c < 3; c++) if (r() > 0.45) cuts.push(-up + r() * (up + down));
    out.push({
      x: n.x + x,
      top: n.y - up,
      bot: n.y + down,
      whisk: r() > 0.72 ? 8 + r() * n.h * 0.7 : 0,
      cuts: cuts.map((c) => n.y + c),
      core: [n.y - up * (0.25 + r() * 0.3), n.y + down * (0.3 + r() * 0.4)],
    });
  }
  return out;
}
const CLUSTERS = NODES.map((n, i) => bars(n, 11 + i * 7));

function legPoint(i: number, t: number): [number, number] {
  const [a, b, bow] = LEGS[i];
  const A = NODES[a];
  const B = NODES[b];
  const mx = (A.x + B.x) / 2;
  const my = (A.y + B.y) / 2;
  const dx = B.x - A.x;
  const dy = B.y - A.y;
  const len = Math.hypot(dx, dy) || 1;
  const cx = mx + (dy / len) * bow;
  const cy = my - (dx / len) * bow;
  const u = 1 - t;
  return [u * u * A.x + 2 * u * t * cx + t * t * B.x, u * u * A.y + 2 * u * t * cy + t * t * B.y];
}

const ease = (t: number) => 1 - (1 - t) ** 3;
const clamp = (t: number) => Math.max(0, Math.min(1, t));

type CardState = { loop: Loop; phase: 0 | 1 | 2 | 3 | 4; seconds: number; amount: number };
const PHASE = ["Waiting…", "Repaying…", "Reacting…", "Settling…", "Paid"];

export function HeroGlobe() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [card, setCard] = useState<CardState>({ loop: data.loops[0], phase: 0, seconds: 0, amount: 0 });

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext("2d")!;
    const still = reducedMotion();
    let raf = 0;
    let w = 0;
    let h = 0;
    let scale = 1;
    let pal = palette();
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = w * dpr;
      el.height = h * dpr;
      scale = h / FIELD;
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    const mo = new MutationObserver(() => (pal = palette()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const start = performance.now();
    let loopIndex = 0;
    let loopStart = start + 900;
    let last = "";

    const hair = (a: number) => (pal.dark ? `rgba(255,255,255,${a})` : `rgba(17,17,19,${a})`);

    const draw = (now: number) => {
      const intro = still ? 1 : ease(clamp((now - start) / 1400));
      const fw = w / scale;
      ctx.clearRect(0, 0, fw, FIELD);

      // Grid, and a cross on some of its corners.
      ctx.lineWidth = 1;
      ctx.strokeStyle = hair(0.045);
      ctx.beginPath();
      for (let x = 48; x < fw; x += GRID) {
        ctx.moveTo(x + 0.5, 0);
        ctx.lineTo(x + 0.5, FIELD * intro);
      }
      for (let y = 48; y < FIELD; y += GRID) {
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(fw * intro, y + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = hair(0.38 * intro);
      ctx.beginPath();
      for (let x = 48, i = 0; x < fw; x += GRID, i++) {
        for (let y = 48, j = 0; y < FIELD; y += GRID, j++) {
          if ((i * 7 + j * 3) % 5 > 1) continue;
          ctx.moveTo(x - 4, y + 0.5);
          ctx.lineTo(x + 5, y + 0.5);
          ctx.moveTo(x + 0.5, y - 4);
          ctx.lineTo(x + 0.5, y + 5);
        }
      }
      ctx.stroke();

      // The globe: an outline, one parallel, two meridians.
      ctx.strokeStyle = hair(0.16);
      ctx.beginPath();
      ctx.arc(443, 470, 394, Math.PI * (1 + 0.02), Math.PI * (1 + 0.02) + Math.PI * 0.96 * intro);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(443, 330, 470, 82, 0, Math.PI * 0.04, Math.PI * 0.04 + Math.PI * 0.92 * intro);
      ctx.stroke();
      ctx.strokeStyle = hair(0.1);
      ctx.beginPath();
      ctx.moveTo(250, 330);
      ctx.quadraticCurveTo(190, 470, 140, 728);
      ctx.moveTo(505, 410);
      ctx.quadraticCurveTo(498, 300, 480, 280);
      ctx.moveTo(662, 300);
      ctx.quadraticCurveTo(672, 330, 670, 345);
      ctx.stroke();
      ctx.fillStyle = hair(0.7 * intro);
      ctx.fillRect(210, 392, 3, 3);
      ctx.fillRect(496, 410, 3, 3);

      // Where this loop is.
      let t = (now - loopStart) / 1000;
      if (still) t = T_HOLD - 0.5;
      if (t > T_END) {
        loopIndex = (loopIndex + 1) % data.loops.length;
        loopStart = now + 500;
        t = -0.5;
      }
      const loop = data.loops[loopIndex];
      const fade = t > T_HOLD ? 1 - clamp((t - T_HOLD) / (T_END - T_HOLD)) : 1;
      const legT = LEGS.map((_, i) => ease(clamp((t - T_LEG[i]) / (T_LEG[i + 1] - T_LEG[i]))));
      const lit = NODES.map((_, i) => {
        if (i === 0) return clamp((t - 0.05) / 0.3);
        return clamp((legT[i - 1] - 0.85) / 0.15);
      });

      // Dotted ways between the nodes.
      ctx.fillStyle = hair(0.42 * intro);
      LEGS.forEach((_, i) => {
        for (let s = 0.08; s < 0.93; s += 0.028) {
          const [x, y] = legPoint(i, s);
          ctx.fillRect(x, y, 1.6, 1.6);
        }
      });

      // The clusters of bars.
      CLUSTERS.forEach((cl, i) => {
        const on = lit[i] * fade;
        for (const b of cl) {
          const grow = intro;
          const top = NODES[i].y + (b.top - NODES[i].y) * grow;
          const bot = NODES[i].y + (b.bot - NODES[i].y) * grow;
          if (b.whisk) {
            ctx.fillStyle = pal.dark ? "rgba(77,139,255,0.28)" : "rgba(127,178,255,0.45)";
            ctx.fillRect(b.x + 1, top - b.whisk * grow, 1, bot - top + b.whisk * grow * 1.6);
          }
          ctx.fillStyle = pal.dark ? "rgba(77,139,255,0.5)" : "rgba(127,178,255,0.9)";
          ctx.fillRect(b.x, top, 3, bot - top);
          if (on > 0.01) {
            ctx.globalAlpha = on;
            ctx.fillStyle = pal.blue;
            ctx.fillRect(b.x, b.core[0], 3, b.core[1] - b.core[0]);
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = pal.canvas;
          for (const c of b.cuts) if (c > top + 2 && c < bot - 2) ctx.fillRect(b.x, c, 3, 1);
        }
      });

      // The loop itself: thick dashes along each leg it has travelled.
      ctx.fillStyle = pal.blue;
      legT.forEach((p, i) => {
        if (p <= 0) return;
        ctx.globalAlpha = fade;
        for (let s = 0.06; s < 0.94 * p; s += 0.022) {
          const [x, y] = legPoint(i, s);
          ctx.fillRect(x - 1.5, y - 5, 3.5, 10);
        }
        if (p < 1) {
          const [x, y] = legPoint(i, 0.06 + 0.88 * p);
          ctx.fillStyle = pal.surface;
          ctx.fillRect(x - 4, y - 4, 8, 8);
          ctx.strokeStyle = pal.blue;
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 3, y - 3, 6, 6);
          ctx.fillStyle = pal.blue;
        }
        ctx.globalAlpha = 1;
      });

      // Labels: the node's name and the block it acted in.
      ctx.font = '500 10px "Geist Mono Variable", ui-monospace, monospace';
      ctx.textBaseline = "middle";
      const blockOf = [loop.originBlock, loop.originBlock, 0, loop.originBlock + loop.lag, loop.originBlock + loop.lag];
      NODES.forEach((n, i) => {
        if (!n.label) return;
        const on = lit[i] * fade;
        const text = i === 2 ? "LASNA  5318007" : `${n.id}  ${num(blockOf[i])}`;
        const [lx, ly] = n.label;
        const tw = ctx.measureText(text).width + 14;
        ctx.globalAlpha = intro;
        ctx.fillStyle = pal.surface;
        ctx.fillRect(lx, ly, tw, 18);
        ctx.strokeStyle = hair(0.28);
        ctx.lineWidth = 1;
        ctx.strokeRect(lx + 0.5, ly + 0.5, tw - 1, 17);
        if (on > 0.01) {
          ctx.globalAlpha = on * intro;
          ctx.fillStyle = pal.blue;
          ctx.fillRect(lx, ly, tw, 18);
        }
        ctx.globalAlpha = intro;
        ctx.fillStyle = on > 0.5 ? "#fff" : pal.muted;
        ctx.fillText(text, lx + 7, ly + 9.5);
        // The frame the label hangs from.
        ctx.strokeStyle = on > 0.5 ? pal.blue : hair(0.5);
        const bw = Math.min(n.w, 150) + 12;
        const bh = Math.min(n.h * 1.3, 70) + 10;
        ctx.strokeRect(lx + 0.5, ly + 18.5, bw, bh);
        ctx.fillStyle = on > 0.5 ? pal.blue : hair(0.6);
        ctx.fillRect(lx - 1, ly + 17 + bh, 3, 3);
        ctx.fillRect(lx + bw - 1, ly + 17 + bh, 3, 3);
        ctx.globalAlpha = 1;
      });

      // The card follows the same clock.
      const phase = t < T_LEG[0] ? 0 : t < T_LEG[1] ? 1 : t < T_LEG[2] ? 2 : t < T_LEG[3] ? 3 : t < T_LEG[4] ? 3 : 4;
      const run = clamp((t - T_LEG[1]) / (T_LEG[3] - T_LEG[1]));
      const seconds = Math.round(run * loop.lag * 0.2 * 10) / 10;
      const amount = phase === 4 ? Math.round(loop.assets * ease(clamp((t - T_LEG[4]) / 0.7))) : 0;
      const key = `${loop.n}|${phase}|${seconds}|${amount}`;
      if (key !== last) {
        last = key;
        setCard({ loop, phase: phase as CardState["phase"], seconds, amount });
      }
      if (!still) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  const { loop, phase, seconds, amount } = card;
  return (
    <div className="hero-globe" aria-hidden>
      <canvas ref={canvas} />
      <div className={phase === 4 ? "loop-card paid" : "loop-card"}>
        <i style={{ left: 5, top: 5 }} />
        <i style={{ right: 5, top: 5 }} />
        <i style={{ left: 5, bottom: 5 }} />
        <i style={{ right: 5, bottom: 5 }} />
        <div className="r1">
          <span>
            <em />
            {PHASE[phase]}
          </span>
          <span className="mono">{(phase === 4 ? +secs(loop.lag) : seconds).toFixed(1)} s</span>
        </div>
        <div className="r2">
          {num(amount)}
          <span>.00</span>
          <small>sbUSD</small>
        </div>
        <div className="r3">
          Repay <b>→</b> Lasna <b>→</b> Queue
        </div>
        <div className="r4">
          Loop {loop.n} · {short(loop.settlement, 6, 4)}
        </div>
      </div>
    </div>
  );
}
