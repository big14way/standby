import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { Arrow, Chevron } from "../icons";
import { REPO } from "../lib";
import { EASE, Reveal, Words } from "../reveal";

const ITEMS = [
  {
    q: "What happens to my position while I wait?",
    a: "It stays in Morpho, in your name, earning interest. The queue never holds your funds: you authorise it on Morpho once, and when liquidity returns it withdraws for you, straight to your own address. Revoke the authorisation and your ticket is voided; nothing else is touched.",
  },
  {
    q: "Who runs the settlement?",
    a: "Nobody you have to keep online. A reactive contract on Reactive Lasna subscribes to the market's Repay, Supply and Liquidate events and asks for a callback when one fires. The queue accepts that callback only from the chain's callback proxy, carrying the watcher's address.",
  },
  {
    q: "Can someone still get there first?",
    a: "Yes: anyone who lands a withdrawal within about a second of the repayment, and always one in the same block. In the race a rival inside 0.8 s won 36 of 36, between 1.0 and 1.8 s it was 19 to the queue and 18 to the rival, and from 2.0 s the queue won 41 of 41.",
  },
  {
    q: "Do bots really empty these markets in seconds?",
    a: "Not in the data. Across five fully borrowed Morpho markets, 7 of 1,103 inflows were touched within 12 seconds, and three quarters sat for more than ten minutes before going to whoever came first. The queue's point is order without watching, more than speed.",
  },
  {
    q: "Is it ready for mainnet?",
    a: "No. It runs on testnets, in our own market on the real Morpho Blue, with test tokens and an oracle we set. The contracts are not audited, and a stranger can make the queue pay gas for a callback it then refuses. The README lists every limit.",
  },
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="section" id="faq">
      <div className="container faq-grid">
        <div className="faq-head">
          <Words parts={["Questions,", { dim: "answered." }]} />
          <Reveal delay={0.15}>
            <a className="link" href={`${REPO}/issues`} target="_blank" rel="noreferrer">
              <span>Ask on GitHub</span>
              <Arrow />
            </a>
          </Reveal>
        </div>
        <Reveal className="faq-list" delay={0.1}>
          {ITEMS.map((it, i) => (
            <div key={it.q} className={open === i ? "faq-item open" : "faq-item"}>
              <h3>
                <button
                  type="button"
                  className="faq-q"
                  aria-expanded={open === i}
                  onClick={() => setOpen(open === i ? -1 : i)}
                >
                  {it.q}
                  <Chevron />
                </button>
              </h3>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.div
                    className="faq-a"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: EASE }}
                  >
                    <p className="text">{it.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
