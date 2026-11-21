import { motion } from "motion/react";

import { Arrow } from "../icons";
import { REPO } from "../lib";
import { EASE, Words } from "../reveal";
import { HeroGlobe } from "./HeroGlobe";

const up = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: EASE, delay },
});

export function Hero() {
  return (
    <section className="hero" id="top">
      <HeroGlobe />
      <div className="container">
        <div className="hero-copy">
          <div className="hero-lead">
            <div className="hero-text">
              <Words as="h1" className="h1" parts={["Exits that", "\n", "wait in line."]} onLoad delay={0.05} />
              <motion.p className="lead" {...up(0.3)}>
                Standby is an exit queue for fully borrowed Morpho Blue markets. Join once. When a borrower repays,
                the Reactive Network settles the queue and pays lenders in the order they arrived, with nobody
                watching.
              </motion.p>
            </div>
            <motion.div className="ctas" {...up(0.4)}>
              <a className="btn btn-ink" href="#try">
                Try it live
              </a>
              <a className="link" href={REPO} target="_blank" rel="noreferrer">
                <span>Read the code</span>
                <Arrow />
              </a>
            </motion.div>
          </div>
          <motion.div className="proof-row" {...up(0.5)}>
            <div>
              <span className="discs">
                <span className="disc" style={{ left: 0, background: "#2468f0" }}>
                  B
                </span>
                <span className="disc" style={{ left: 14, background: "#7c5cfa" }}>
                  R
                </span>
                <span className="disc" style={{ left: 28, background: "#111113" }}>
                  M
                </span>
                <span className="live-dot" />
              </span>
              <span>
                Live on <b>2</b> testnets
              </span>
            </div>
            <div>
              <span>
                <b>220</b> loops measured
              </span>
            </div>
            <div>
              <span>
                <b>1.4</b> s median, end to end
              </span>
            </div>
            <div>
              <svg className="seal" viewBox="0 0 26 26" aria-hidden>
                <path
                  d="M13 1.500l2.700 2 3.300-.300 1.200 3.100 3.100 1.200-.300 3.300 2 2.700-2 2.700.300 3.300-3.100 1.200-1.200 3.100-3.300-.300-2.700 2-2.700-2-3.300.300-1.200-3.100-3.100-1.200.300-3.300-2-2.700 2-2.700-.300-3.300 3.100-1.200 1.200-3.100 3.300.300 2.700-2Z"
                  fill="var(--faint)"
                />
                <path d="m8.800 13.300 2.900 2.900 5.500-6" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>
                <b>Source</b> verified
              </span>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
