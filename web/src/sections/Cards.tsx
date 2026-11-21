import { useInView } from "motion/react";
import { type ReactNode, useRef } from "react";

import { Barrier, Sheets, Source, Stopwatch, Switch, Tests, Track } from "../art";
import { Arrow } from "../icons";
import { QUEUE, REPO } from "../lib";
import { Reveal } from "../reveal";

type Card = { art: ReactNode; title: string; text: string; link: string; href: string };

function OCard({ c, i, delay }: { c: Card; i: number; delay: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.35 });
  const external = c.href.startsWith("http");
  return (
    <Reveal delay={delay}>
      <div ref={ref} className={seen ? "ocard in" : "ocard"}>
        <span className="caps idx">#{i + 1}</span>
        <div className="top">
          <div className="art">{c.art}</div>
          <h3 className="h3">{c.title}</h3>
          <div className="rule" />
          <p className="text">{c.text}</p>
        </div>
        <a className="link" href={c.href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})}>
          <span>{c.link}</span>
          <Arrow />
        </a>
      </div>
    </Reveal>
  );
}

const EVIDENCE: Card[] = [
  {
    art: <Stopwatch />,
    title: "Latency",
    text: "Repayment to lender paid: a median of 1.4 s.",
    link: "See the 220 loops",
    href: "#latency",
  },
  {
    art: <Track />,
    title: "The race",
    text: "A rival two seconds behind lost 41 times in 41.",
    link: "How it was run",
    href: "#race",
  },
  {
    art: <Sheets />,
    title: "History",
    text: "Freed liquidity went to whoever was watching.",
    link: "Read the study",
    href: `${REPO}#what-history-says-about-freed-liquidity`,
  },
  {
    art: <Barrier />,
    title: "Refusals",
    text: "A callback nobody asked for changes nothing.",
    link: "The transactions",
    href: `${REPO}#refusals-on-chain`,
  },
];

export function Evidence() {
  return (
    <section className="section" id="evidence">
      <div className="container stack-48">
        <Reveal>
          <div className="split-head">
            <h2 className="h2">
              Four studies.
              <br />
              <span className="dim">One claim.</span>
            </h2>
            <div className="split-side">
              <p className="text">Each stands alone. Every number is on a chain.</p>
              <a className="link" href={`${REPO}/tree/main/data`} target="_blank" rel="noreferrer">
                <span>Open the data</span>
                <Arrow />
              </a>
            </div>
          </div>
        </Reveal>
        <div className="grid-2">
          {EVIDENCE.map((c, i) => (
            <OCard key={c.title} c={c} i={i} delay={0.18 + i * 0.06} />
          ))}
        </div>
      </div>
    </section>
  );
}

const CHECKED: Card[] = [
  {
    art: <Source />,
    title: "Verified source",
    text: "All three contracts match on Sourcify, exactly.",
    link: "Read the queue",
    href: `https://repo.sourcify.dev/84532/${QUEUE}`,
  },
  {
    art: <Tests />,
    title: "Tested",
    text: "42 tests run on Morpho's own bytecode.",
    link: "See what they cover",
    href: `${REPO}#build-and-test`,
  },
  {
    art: <Switch />,
    title: "Your position",
    text: "Never holds your funds. Revoke any time.",
    link: "How custody works",
    href: "#faq",
  },
];

export function Checked() {
  return (
    <section className="section" id="checked">
      <div className="container stack-48">
        <Reveal>
          <div className="split-head">
            <h2 className="h2">
              <span className="dim">Built to be</span>
              <br />
              checked.
            </h2>
            <div className="split-side">
              <p className="text">A queue for other people's money should be the easiest part to verify.</p>
              <a className="link" href={`${REPO}#limits`} target="_blank" rel="noreferrer">
                <span>Read the limits</span>
                <Arrow />
              </a>
            </div>
          </div>
        </Reveal>
        <div className="grid-3">
          {CHECKED.map((c, i) => (
            <OCard key={c.title} c={c} i={i} delay={0.18 + i * 0.06} />
          ))}
        </div>
      </div>
    </section>
  );
}
