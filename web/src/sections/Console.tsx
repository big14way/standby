import { motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import type { QueueState, Sent, Settled } from "../chain";
import { Arrow, ArrowUpRight, Check, Copy, Play } from "../icons";
import { BASESCAN, QUEUE, REPO, TRY_IT, num, secs, short } from "../lib";
import { EASE, Reveal, Words } from "../reveal";

const TRY = `import { createWalletClient, custom } from "viem"
import { baseSepolia } from "viem/chains"

const wallet = createWalletClient({
  chain: baseSepolia, transport: custom(window.ethereum),
})

// Repay 100 test dollars of the demo borrower's debt
const hash = await wallet.writeContract({
  address: "${TRY_IT}",
  abi: tryItAbi, functionName: "tryIt",
})
// The queue pays the lender. You do not send that one.`;

const JOIN = `// Once: let the queue withdraw for you, to you
morpho.setAuthorization(address(queue), true);

// Take a ticket. The fee funds the callbacks
uint256 ticket = queue.join{value: queue.JOIN_FEE()}(
  marketId, 200_000e18
);

// Nothing else to run. When liquidity returns:
//   Morpho emits Repay  ->  the watcher reacts on Lasna
//   ->  queue.settle() pays tickets in order

queue.cancel(marketId); // or leave the line at any time`;

// viem is most of the page's weight, so it loads after the page does.
const chain = () => import("../chain");
const readQueue = () => chain().then((c) => c.readQueue());

const KEYWORDS = /^(import|from|const|await|new|uint256|address|true|false)$/;
function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const comment = line.indexOf("//");
  const code = comment >= 0 ? line.slice(0, comment) : line;
  code.split(/("[^"]*"|[A-Za-z_][A-Za-z0-9_]*|[{}()[\];:,.=>-]+)/).forEach((t, i) => {
    if (!t) return;
    const cls = t.startsWith('"') ? "tk-s" : KEYWORDS.test(t) ? "tk-k" : /^[{}()[\];:,.=>-]+$/.test(t) ? "tk-p" : undefined;
    out.push(
      <span key={i} className={cls}>
        {t}
      </span>,
    );
  });
  if (comment >= 0)
    out.push(
      <span key="c" className="tk-c">
        {line.slice(comment)}
      </span>,
    );
  return out;
}

type Run =
  | { at: "idle" }
  | { at: "busy"; stage: string; sent?: Sent }
  | { at: "paid"; sent: Sent; settled: Settled }
  | { at: "late"; sent: Sent }
  | { at: "error"; message: string };

const Tx = ({ hash }: { hash: string }) => (
  <a href={`${BASESCAN}/tx/${hash}`} target="_blank" rel="noreferrer">
    {short(hash, 8, 6)}
  </a>
);

export function Console() {
  const [tab, setTab] = useState<"try" | "join">("try");
  const [copied, setCopied] = useState("");
  const [state, setState] = useState<QueueState | null>(null);
  const [run, setRun] = useState<Run>({ at: "idle" });
  const tabs = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ left: 3, width: 64 });

  useEffect(() => {
    readQueue().then(setState, () => setState(null));
  }, []);
  useEffect(() => {
    const b = tabs.current!.querySelector<HTMLButtonElement>("button.on")!;
    setThumb({ left: b.offsetLeft, width: b.offsetWidth });
  }, [tab]);

  const copy = (what: string, text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(what);
      setTimeout(() => setCopied(""), 1600);
    });
  };

  const go = async () => {
    try {
      setRun({ at: "busy", stage: "Waiting for the wallet" });
      const { sendTryIt, waitForLoop } = await chain();
      const sent = await sendTryIt((stage) => setRun({ at: "busy", stage }));
      setRun({ at: "busy", stage: "Waiting for the queue to pay", sent });
      const settled = await waitForLoop(sent);
      setRun(settled ? { at: "paid", sent, settled } : { at: "late", sent });
      readQueue().then(setState, () => {});
    } catch (e) {
      const m = (e as { shortMessage?: string; message?: string }).shortMessage ?? (e as Error).message ?? "Failed";
      setRun({ at: "error", message: m.split("\n")[0].slice(0, 160) });
    }
  };

  const code = tab === "try" ? TRY : JOIN;
  const busy = run.at === "busy";
  const sent = "sent" in run ? run.sent : undefined;

  let status: ReactNode = <span className="caps ok">Live · read from the queue</span>;
  let body: unknown = state
    ? {
        queue: QUEUE,
        loops: state.loops,
        loopsThatPaid: state.loopsThatPaid,
        lendersWaiting: state.openTickets,
        waitingToBePaid: `${num(state.pending, 2)} sbUSD`,
        triesByVisitors: state.tries,
      }
    : { queue: QUEUE, state: "reading Base Sepolia…" };
  if (run.at === "busy") {
    status = <span className="caps ok busy">{run.stage}</span>;
    if (sent) body = { tryIt: sent.hash, block: sent.block, settlement: "waiting for a transaction you did not send…" };
  } else if (run.at === "paid") {
    status = (
      <span className="caps ok">
        Paid · {run.settled.lag} blocks · {secs(run.settled.lag)} s
      </span>
    );
    body = {
      tryIt: run.sent.hash,
      block: run.sent.block,
      settlement: run.settled.tx,
      settledBlock: run.settled.block,
      lagBlocks: run.settled.lag,
      seconds: +secs(run.settled.lag),
      paidToLender: `${num(run.settled.paid, 2)} sbUSD`,
      sentByYou: false,
    };
  } else if (run.at === "late") {
    status = <span className="caps ok busy">Not seen within 45 s</span>;
    body = { tryIt: run.sent.hash, block: run.sent.block, settlement: null, note: "Check the queue's Loop events on Basescan." };
  } else if (run.at === "error") {
    status = <span className="caps ok err">Not sent</span>;
    body = { error: run.message };
  }

  return (
    <section className="section dev" id="try">
      <div className="container">
        <div className="dev-copy">
          <div>
            <Words parts={["Run a loop", { dim: "yourself, now." }]} />
            <Reveal delay={0.15}>
              <p className="lead">
                One public call on Base Sepolia repays 100 test dollars. A second or two later the queue pays the
                lender, in a transaction you did not send.
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.2}>
            <div className="cli">
              <span>
                <em>$</em>forge test
              </span>
              <button type="button" aria-label="Copy the command" onClick={() => copy("cli", "forge test")}>
                {copied === "cli" ? <Check /> : <Copy />}
              </button>
            </div>
          </Reveal>
          <div className="checks-link">
            <Reveal delay={0.25}>
              <ul className="checks">
                <li>
                  <Check /> The tests need no keys and no RPC
                </li>
                <li>
                  <Check /> Every measured loop is in the repository
                </li>
              </ul>
            </Reveal>
            <Reveal delay={0.3}>
              <a className="link" href={`${REPO}#try-it`} target="_blank" rel="noreferrer">
                <span>Run it from a terminal</span>
                <Arrow />
              </a>
            </Reveal>
          </div>
        </div>
        <Reveal className="console" delay={0.1}>
          <div className="con-bar">
            <div className="tabs" ref={tabs} role="tablist">
              <span className="thumb" style={thumb} />
              <button type="button" role="tab" aria-selected={tab === "try"} className={tab === "try" ? "on" : undefined} onClick={() => setTab("try")}>
                Try it
              </button>
              <button type="button" role="tab" aria-selected={tab === "join"} className={tab === "join" ? "on" : undefined} onClick={() => setTab("join")}>
                Join
              </button>
            </div>
            <span className="caps">{tab === "try" ? "Base Sepolia · 84532" : "Solidity · Morpho Blue"}</span>
          </div>
          <div className="con-main">
            <div className="code" key={tab}>
              {code.split("\n").map((line, i) => (
                <motion.div
                  key={i}
                  className="ln"
                  initial={{ opacity: 0, x: -4 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, ease: EASE, delay: 0.1 + i * 0.04 }}
                >
                  <span>{i + 1}</span>
                  <span>{line ? highlight(line) : "​"}</span>
                </motion.div>
              ))}
            </div>
            <ol className="logs" aria-live="polite">
              {tab === "join" ? (
                <>
                  <li>join · ticket issued · position stays in Morpho</li>
                  <li>watcher · subscribes to Repay, Supply, Liquidate</li>
                  <li>settle · first in, first out · six tickets a callback</li>
                </>
              ) : (
                <>
                  <li className={sent ? undefined : "wait"}>
                    {sent ? (
                      <>
                        repay · 100 sbUSD · block {num(sent.block)} ·&nbsp;
                        <Tx hash={sent.hash} />
                      </>
                    ) : (
                      "repay · 100 sbUSD · your transaction"
                    )}
                  </li>
                  <li className={run.at === "paid" ? undefined : "wait"}>watcher · Reactive Lasna · reacts to Morpho's Repay</li>
                  <li className={run.at === "paid" ? undefined : "wait"}>
                    {run.at === "paid" ? (
                      <>
                        queue · paid {num(run.settled.paid, 2)} · block {num(run.settled.block)} ·&nbsp;
                        <Tx hash={run.settled.tx} />
                      </>
                    ) : (
                      "queue · pays the lender · not your transaction"
                    )}
                  </li>
                </>
              )}
            </ol>
            <div className="con-actions">
              {tab === "try" ? (
                <p className="con-note">
                  MetaMask may flag this new site. Prefer a terminal? The same call is{" "}
                  <a href={`${REPO}#try-it`} target="_blank" rel="noreferrer">
                    in the README
                  </a>
                  .
                </p>
              ) : null}
              <button type="button" className="con-btn" onClick={() => copy("code", code)}>
                {copied === "code" ? <Check /> : <Copy />}
                {copied === "code" ? "Copied!" : "Copy"}
              </button>
              {tab === "try" ? (
                <button type="button" className="con-btn primary" onClick={go} disabled={busy}>
                  <Play />
                  {busy ? "Running…" : run.at === "paid" ? "Run it again" : "Run it with a wallet"}
                </button>
              ) : (
                <a className="con-btn" href={`${REPO}/blob/main/src/StandbyQueue.sol`} target="_blank" rel="noreferrer">
                  View on GitHub
                  <ArrowUpRight />
                </a>
              )}
            </div>
          </div>
          <div className="con-res">
            <div className="rh">
              <span className="caps">Response</span>
              {status}
            </div>
            <pre>{JSON.stringify(body, null, 2)}</pre>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
