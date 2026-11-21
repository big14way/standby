import { useEffect, useRef, useState } from "react";

import { ArrowDown, Check, CheckCircle, Chevron, Token } from "../icons";
import { BASESCAN, data, num, reducedMotion, secs } from "../lib";
import { Reveal, Words } from "../reveal";

// The first measured loop, as it is on the two chains (README, "One loop").
const L = data.loops[0];
const OTHERS = [data.loops[12], data.loops[56], data.loops[119]];
const LASNA_BLOCK = 8_829_400;
const QUEUED = 200_000;

const STEPS = [
  { name: "Join", text: "Authorise the queue once and take a ticket." },
  { name: "Watch", text: "A reactive contract follows the market's events." },
  { name: "Settle", text: "Liquidity returns; a callback reaches the queue." },
  { name: "Paid", text: "Lenders are paid in order, to their own address." },
];
const BUTTON = ["Join the queue", "Watching Morpho…", `Settling in block ${num(L.originBlock + L.lag)}`, "Next in line"];

function useTyped(text: string, active: boolean) {
  const [n, setN] = useState(text.length);
  useEffect(() => {
    if (!active || reducedMotion()) return setN(text.length);
    setN(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, 70);
    return () => clearInterval(id);
  }, [active, text]);
  return text.slice(0, n);
}

const Chip = () => (
  <span className="chip">
    <Token k="usd" />
    sbUSD
    <Chevron size={12} />
  </span>
);

function Join({ on }: { on: boolean }) {
  const typed = useTyped(num(QUEUED, 2), on);
  return (
    <>
      <div className="fc-panel">
        <div className="top">
          <span>Queue to withdraw</span>
          <span>Supplied {num(QUEUED, 2)}</span>
        </div>
        <div className="mid">
          <span className={typed ? undefined : "zero"}>{typed || "0.00"}</span>
          <Chip />
        </div>
        <div className="sub">Stays in Morpho, earning, until it is paid out</div>
      </div>
      <span className="fc-swap">
        <ArrowDown />
      </span>
      <div className="fc-panel">
        <div className="top">
          <span>Market can pay now</span>
          <span>100% borrowed</span>
        </div>
        <div className="mid">
          <span className="zero">0.00</span>
          <Chip />
        </div>
        <div className="sub">Withdrawals revert until someone repays</div>
      </div>
      <div className="fc-rows">
        <div className="fc-row">
          <span>Ahead of you</span>
          <span>0 tickets</span>
        </div>
        <div className="fc-row">
          <span>Keeper or bot to run</span>
          <span>
            <i className="dot-g" />
            None
          </span>
        </div>
      </div>
    </>
  );
}

function Watch() {
  return (
    <>
      <div className="w-head">
        <div className="l1">
          <span>
            Repay {num(L.assets, 2)} <Token k="usd" sm /> sbUSD
          </span>
          <span>
            <Token k="base" sm /> Base → <Token k="lasna" sm /> Lasna
          </span>
        </div>
        <div className="caps">3 events watched · loop {L.n} of 220</div>
      </div>
      <div className="w-item">
        <div className="w-line">
          <span className="w-pair">
            <Token k="morpho" /> › <Token k="queue" />
          </span>
          <span className="w-amt">
            {num(L.assets, 2)}
            <small>sbUSD</small>
          </span>
          <span className="pill">{L.lag} blocks</span>
        </div>
        <div className="w-detail">
          <div className="dh">
            <span>Loop {L.n} · 3 steps</span>
            <span className="pill">
              <CheckCircle /> Paid in {secs(L.lag)} s
            </span>
          </div>
          <div className="w-bar" />
          <div className="w-step">
            <CheckCircle />
            <Token k="base" sm /> Repay seen · Base
            <span>{num(L.originBlock)}</span>
          </div>
          <div className="w-step">
            <CheckCircle />
            <Token k="lasna" sm /> Watcher reacts · Lasna
            <span>{num(LASNA_BLOCK)}</span>
          </div>
          <div className="w-step">
            <CheckCircle />
            <Token k="queue" sm /> Queue pays · Base
            <span>{num(L.originBlock + L.lag)}</span>
          </div>
        </div>
      </div>
      {OTHERS.map((o) => (
        <div className="w-item" key={o.n}>
          <div className="w-line">
            <span className="w-pair">
              <Token k="morpho" /> › <Token k="queue" />
            </span>
            <span className="w-amt">
              {num(o.assets, 2)}
              <small>sbUSD</small>
            </span>
            <span className="pill">{secs(o.lag)} s</span>
          </div>
          <div className="w-sub">
            Loop {o.n} · {o.lag} blocks
          </div>
        </div>
      ))}
    </>
  );
}

function Settle() {
  return (
    <>
      <div className="fc-banner">
        <Check />
        Callback verified: sent by the watcher
      </div>
      <div className="fc-panel" style={{ height: 96 }}>
        <div className="top">
          <span>Freed by the repayment</span>
          <span>Base {num(L.originBlock)}</span>
        </div>
        <div className="mid" style={{ marginTop: 8 }}>
          <span>{num(L.assets, 2)}</span>
          <Chip />
        </div>
      </div>
      <span className="fc-swap" style={{ top: 120 }}>
        <ArrowDown />
      </span>
      <div className="fc-panel" style={{ height: 96 }}>
        <div className="top">
          <span>Ticket 1 receives</span>
          <span>{num(QUEUED, 2)} queued</span>
        </div>
        <div className="mid" style={{ marginTop: 8 }}>
          <span>{num(L.assets, 2)}</span>
          <Chip />
        </div>
      </div>
      <div className="fc-rows" style={{ paddingTop: 0 }}>
        <div className="fc-row">
          <span>Re-read the market's liquidity</span>
          <span className="toggle" />
        </div>
        <div className="fc-row">
          <span>Callback gas</span>
          <span>
            <s>lender</s>
            <i className="dot-g" />
            Paid by the queue
          </span>
        </div>
      </div>
    </>
  );
}

function Paid({ on }: { on: boolean }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!on) return setDone(false);
    const id = setTimeout(() => setDone(true), reducedMotion() ? 0 : 900);
    return () => clearTimeout(id);
  }, [on]);
  return (
    <div className={done ? "p-wrap p-done" : "p-wrap"}>
      <span className="p-badge">
        <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
          {done ? (
            <path d="m19 28.500 6.500 6.500L38 21.500" fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <circle className="spin" cx="28" cy="28" r="11" fill="none" stroke="var(--ghost)" strokeWidth="2.500" strokeDasharray="42 30" strokeLinecap="round" />
          )}
        </svg>
      </span>
      <span className="p-title p-fade">Paid</span>
      <span className="p-line p-fade">
        <Token k="usd" sm /> {num(L.assets, 2)} sbUSD <em>→</em> <Token k="ink" sm /> lender
      </span>
      <span className="p-note p-fade">
        {L.lag} blocks, {secs(L.lag)} s after the repayment
      </span>
      <a className="pill p-fade" href={`${BASESCAN}/tx/${L.settlement}`} target="_blank" rel="noreferrer">
        View transaction
      </a>
    </div>
  );
}

function Pane({ i, on }: { i: number; on: boolean }) {
  if (i === 0) return <Join on={on} />;
  if (i === 1) return <Watch />;
  if (i === 2) return <Settle />;
  return <Paid on={on} />;
}

const Head = () => (
  <div className="fc-head">
    <span>Exit queue</span>
    <span className="caps">Ticket 1</span>
  </div>
);

export function Flow() {
  const section = useRef<HTMLElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const [scale, setScale] = useState(1);

  // The section is four screens tall; the stage sticks and the scroll position picks the step.
  useEffect(() => {
    const onScroll = () => {
      const el = section.current!;
      const span = el.offsetHeight - window.innerHeight;
      if (span <= 0) return;
      const p = (window.scrollY - el.offsetTop) / span;
      setStep(Math.max(0, Math.min(3, Math.floor(p * 4))));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientHeight / 560)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = (i: number) => {
    const el = section.current!;
    const span = el.offsetHeight - window.innerHeight;
    if (span <= 0) return;
    window.scrollTo({ top: el.offsetTop + ((i + 0.3) / 4) * span, behavior: "smooth" });
  };

  return (
    <section className="flow" id="how" ref={section}>
      <div className="flow-stage">
        <div className="flow-inner">
          <Words parts={["One exit.", { dim: "Four moves, nobody watching." }]} />
          <div className="flow-grid">
            <Reveal className="flow-steps" delay={0.15}>
              <div className="rail">
                <b style={{ height: `${(step / 3) * 100}%` }} />
              </div>
              <ol>
                {STEPS.map((s, i) => (
                  <li key={s.name} className={i === step ? "on" : undefined}>
                    <h3>
                      <button type="button" onClick={() => go(i)} aria-current={i === step ? "step" : undefined}>
                        <span>0{i + 1}</span>
                        {s.name}
                      </button>
                    </h3>
                    <p className="text" style={{ letterSpacing: 0 }}>
                      {s.text}
                    </p>
                    <div className="flow-phone-card">
                      <div className="flow-card">
                        <Head />
                        <div className="fc-body">
                          <div className="fc-pane on" style={{ position: "relative" }}>
                            <Pane i={i} on />
                          </div>
                        </div>
                        <div className="fc-foot">
                          <span className="fc-btn">
                            <span className="on">{BUTTON[i]}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Reveal>
            <div className="flow-card-wrap" ref={wrap}>
              <div className={step === 1 ? "flow-card bare" : "flow-card"} style={{ transform: `scale(${scale})` }} aria-hidden>
                <Head />
                <div className="fc-body">
                  {STEPS.map((s, i) => (
                    <div key={s.name} className={`fc-pane${i === step ? " on" : ""}${i === 1 ? " full" : ""}`}>
                      <Pane i={i} on={i === step} />
                    </div>
                  ))}
                </div>
                <div className="fc-foot">
                  <span className="fc-btn">
                    {BUTTON.map((b, i) => (
                      <span key={b} className={i === step ? "on" : undefined}>
                        {b}
                      </span>
                    ))}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
