import { useEffect, useState } from "react";

import { Archive, Clock, Flag, Mark, Menu, Shield } from "../icons";
import { REPO } from "../lib";

const EVIDENCE = [
  { href: "#latency", icon: <Clock />, title: "Latency", sub: "Median 1.4 s over 220 measured loops." },
  { href: "#race", icon: <Flag />, title: "The race", sub: "120 trials against a rival withdrawing by hand." },
  { href: "#evidence", icon: <Archive />, title: "History", sub: "1,279 inflows into five full markets." },
  { href: "#evidence", icon: <Shield />, title: "Refusals", sub: "Callbacks nobody asked for, refused on-chain." },
];

export function Nav() {
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  // Slide away on the way down, come back on the way up.
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 6) return;
      setHidden(y > last && y > 120);
      if (y > last) setOpen(false);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={hidden ? "nav hidden" : "nav"}>
      <div className="capsule">
        <a className="logo" href="#top" aria-label="Standby, top of page">
          <span className="mark">
            <Mark />
          </span>
          Standby
        </a>
        <nav className="nav-links" aria-label="Sections">
          <a href="#how">How it works</a>
          <div className="drop">
            <button type="button" aria-haspopup="true">
              Evidence ▾
            </button>
            <div className="drop-panel">
              <div className="drop-card">
                {EVIDENCE.map((e) => (
                  <a key={e.title} className="drop-item" href={e.href}>
                    <i>{e.icon}</i>
                    <span>
                      <b>{e.title}</b>
                      <small>{e.sub}</small>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          </div>
          <a href="#try">Try it</a>
          <a href="#checked">Contracts</a>
          <a href="#faq">Questions</a>
        </nav>
        <div className="nav-actions">
          <a className="btn btn-ghost" href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a className="btn btn-ink" href="#try">
            Try it live
          </a>
          <button className="burger" type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            <Menu />
          </button>
        </div>
      </div>
      {open && (
        <div className="sheet" onClick={() => setOpen(false)}>
          <a href="#how">How it works</a>
          <a href="#evidence">Evidence</a>
          <a href="#latency">Latency</a>
          <a href="#try">Try it</a>
          <a href="#checked">Contracts</a>
          <a href="#faq">Questions</a>
          <a href={REPO} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </div>
      )}
    </header>
  );
}
