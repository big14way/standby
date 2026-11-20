# Standby

**An exit queue for lending markets that have run dry, settled by the Reactive Network.**

When a Morpho Blue market is fully borrowed, lenders cannot withdraw. Liquidity comes back when a borrower
repays, someone supplies, or a position is liquidated, and it goes to whoever withdraws first. Standby lets a
lender queue once and be paid the moment liquidity returns, in order of arrival, with nothing of theirs running.

Built for the Reactive Omni Buildathon, track *Every Second Counts*. On testnet the full loop, from the
repayment to the lender being paid, took a median of **1.4 seconds** over 220 measured loops (p99 2.0 s).

## How it works

1. **Join.** A lender authorises `StandbyQueue` on Morpho once and joins with an amount. The position stays in
   Morpho; the queue never holds lender funds.
2. **Watch.** `StandbyWatcher`, a reactive contract on Reactive Lasna, follows the queue's own state. While a
   market has lenders waiting it subscribes to that market's `Repay`, `Supply` and `Liquidate` events on Morpho,
   and unsubscribes when the queue empties.
3. **Settle.** When liquidity returns, the watcher requests a callback. `StandbyQueue.settle` accepts it only
   from the chain's callback proxy carrying the watcher's address, re-reads the market's real liquidity, and
   withdraws for the lenders at the front, straight to their own addresses. If the liquidity is already gone
   it pays nothing and changes nothing.

Each callback carries the block of the event that caused it, so the queue records the full-loop latency of
every settlement on-chain (`lagHistogram()`).

## Deployed (testnet)

| Contract | Chain | Address |
|---|---|---|
| `StandbyWatcher` | Reactive Lasna (5318007) | [`0x9FA9c9876325Fd30f5e62D97DbC5A543dAc24414`](https://lasna.reactscan.net/address/0x9FA9c9876325Fd30f5e62D97DbC5A543dAc24414) |
| `StandbyQueue` | Base Sepolia (84532) | [`0x757CD246b40A7D58c178ABb7CCEDa5Fb60BFf926`](https://sepolia.basescan.org/address/0x757CD246b40A7D58c178ABb7CCEDa5Fb60BFf926) |
| Morpho Blue (not ours) | Base Sepolia | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` |

Both contracts are source-verified on Sourcify (exact match):
[watcher](https://repo.sourcify.dev/5318007/0x9FA9c9876325Fd30f5e62D97DbC5A543dAc24414),
[queue](https://repo.sourcify.dev/84532/0x757CD246b40A7D58c178ABb7CCEDa5Fb60BFf926).

The demo market is our own market on the real Morpho Blue: test tokens sbUSD
(`0xa600E633cDbBe3003D6626e1b37dB0dbE0AaaF49`) and sbETH (`0x039217f10c00642A52144eB4a8dd24972e246F72`), an oracle
we set (`0xFb6931BD12e428191b193211002D190C49470e5f`), Morpho's AdaptiveCurveIrm and an 86% LLTV. Market id
`0x321754d492bcd755a8b2be25eb2662875a132880158d8975b21e823853bd237a`.

### One loop

The market was fully borrowed and one lender was queued for 200,000 sbUSD. A borrower repaid 261.

| Step | Chain | Block | Transaction |
|---|---|---|---|
| Repayment (the origin event) | Base Sepolia | 61,375,955 | [`0xb97a2a4d…6ec98c`](https://sepolia.basescan.org/tx/0xb97a2a4d0ee7efcf9366406311b1598405c8b3c41a5d6eb8904643fd4b6ec98c) |
| Watcher reacts, requests the callback | Reactive Lasna | 8,829,400 | [`0xfd290c83…0944b0`](https://lasna.reactscan.net/tx/0xfd290c83c73f5ce241ad70eecc9b4f0349a9a662f9db2f62730b40f06f0944b0) |
| Queue settles, pays the lender 261 | Base Sepolia | 61,375,960 | [`0xc90c4cec…fadfb3`](https://sepolia.basescan.org/tx/0xc90c4cec8898a4030793f266f3f709040294a21c454c231f4108a6e8c9fadfb3) |

Five Base Sepolia blocks from repayment to payout. At 0.2 s a block that is 1.0 s. Latency is counted in Base
Sepolia blocks, because the origin event and the payout are on the same chain and its blocks are 0.2 s apart.
The queue records it itself: the `Loop` event of the settlement carries the origin block and the origin
transaction hash.

An earlier deployment (queue `0xC0BAA9aFe6C810b584D52e6b1EE5a849CA538642`, watcher
`0x9F0c2ca01276d9d7AA064b876bcf2b0b9880E9bc`) ran the very first loop in nine blocks. It was replaced after
testnet use showed that a wallet's gas estimate for `join` skipped the on-the-spot payment; `join` now reverts
when it is sent too little gas to pay.

## Latency, measured

220 loops on the deployment above, each one a real transaction on Base Sepolia that put liquidity back into the
fully borrowed market: 200 repayments by the borrower and 20 supplies by a third account, of 50 to 500 sbUSD,
sent 0.3 to 3 seconds apart. Lender, borrower and supplier are three separate accounts. Every loop settled and
every one paid the lender the full amount that came back.

| Full loop: origin event to lender paid | Base Sepolia blocks | Seconds |
|---|---|---|
| Fastest | 4 | 0.8 |
| Median | 7 | 1.4 |
| 90th percentile | 9 | 1.8 |
| 99th percentile | 10 | 2.0 |
| Slowest | 17 | 3.4 |

| Blocks | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 17 |
|---|---|---|---|---|---|---|---|---|
| Loops | 1 | 48 | 33 | 40 | 37 | 48 | 12 | 1 |

Repayments alone: median 7 blocks. Third-party supplies alone: median 8 blocks. A settlement that pays one
lender uses about 194,000 gas.

How this was measured, and how to check it:

- `measure/run.py` sends the origin transaction and records three hashes per loop: the origin transaction, the
  watcher's transaction on Reactive Lasna, and the settlement. All 220 are in [`data/loops.jsonl`](data/loops.jsonl).
- `measure/verify.py` then fetches every receipt from both chains and checks that the Lasna transaction and the
  settlement both name that origin transaction, and that the blocks match. Only loops that pass are counted.
  All 220 passed. The result is [`data/summary.json`](data/summary.json).
- Nothing is timed with a local clock. Latency is the settlement's block minus the origin's block.
- The queue keeps the same record on-chain. `lagHistogram()` on the queue returns the distribution above,
  count for count.

One thing could not be measured. The loop has two legs, Base Sepolia to Lasna and Lasna back to Base Sepolia,
and splitting the 1.4 s between them needs the two chains' clocks to agree. Lasna stamps its blocks in whole
seconds, and its stamps read about two seconds behind Base Sepolia's: in most loops the Lasna transaction is
stamped *earlier* than the event it reacted to. So only the end-to-end figure is given. The Lasna transaction
of every loop is in the data for anyone who wants to look.

## What history says about freed liquidity

Does speed matter here? To find out, the full history of five Morpho Blue markets that are fully borrowed
today was downloaded from Morpho's API (69,603 supply, withdraw, borrow, repay and liquidation events) and
each market's liquidity rebuilt event by event. Then every moment was found where a market was full and an
event put at least 100 USDC back, and how long it took before anyone took liquidity out again.

| Market | Chain | Events | Inflows into a full market | Gone in the same transaction | Taken in the next block | 2 to 5 blocks | 6 to 30 blocks | Later |
|---|---|---|---|---|---|---|---|---|
| USR / USDC | Ethereum | 28,342 | 452 | 15 | 6 | 16 | 62 | 353 |
| wstUSR / USDC | Ethereum | 14,809 | 243 | 56 | 1 | 3 | 22 | 161 |
| sdeUSD / USDC | Ethereum | 17,954 | 249 | 7 | 0 | 7 | 32 | 203 |
| deUSD / USDC | Ethereum | 1,019 | 22 | 0 | 0 | 0 | 2 | 20 |
| USR / USDC | Base | 7,479 | 313 | 98 | 0 | 0 | 3 | 212 |
| **All five** | | **69,603** | **1,279** | **176** | **7** | **26** | **121** | **949** |

Of the 1,103 inflows that outlived their own transaction:

| First taken out again | Inflows | Share |
|---|---|---|
| within 12 s | 7 | 0.6% |
| 12 s to 60 s | 29 | 2.6% |
| 1 to 10 minutes | 223 | 20.2% |
| later than 10 minutes | 844 | 76.5% |

What this shows, and what it does not:

- **It does not show a race measured in seconds.** In these five markets freed liquidity was taken within one
  Ethereum block seven times in 1,103. A loop of 1.4 seconds and a loop of 9 seconds would have reached the
  same liquidity. This project does not claim that bots empty these markets in seconds; the data says they
  did not.
- **It shows that whoever was watching got paid, and that most lenders were not watching.** Three quarters of
  the time the money sat for more than ten minutes, and then went to whoever came first, not to whoever had
  waited longest. A queue that reacts in the next second or two is first every time, for every lender in it,
  in arrival order, with nobody watching anything.
- **It shows freed liquidity being lent out again instead of reaching lenders.** In 110 of the 1,103 cases the
  first taker was a new loan, not a withdrawal. In the Base USR / USDC market, stuck since March 2026 with
  1.23M USDC supplied, four repayments or liquidations of 78 to 2,220 USDC arrived while it was full and
  stayed past their own block; three of the four were first drawn on by a new borrower.
- 176 inflows were taken out again inside the transaction that brought them (a supply and a withdrawal or
  loan in one call). Nothing outside that transaction could have reached them, this queue included.

The seconds matter for a different reason, which the next section measures: against a rival who *is* watching,
the queue wins only if its loop is shorter than the rival's.

To reproduce: `python3 history/fetch.py <chain id> <market id>` downloads a market (the five used are listed in
`history/markets.json`, their data is in `history/data/`), `cd history && python3 report.py` prints the tables.
A market's rebuilt liquidity never goes below zero in any of the five and ends at zero, as it must for a
market that is full today.

## Layout

| Path | What |
|---|---|
| `src/StandbyQueue.sol` | The queue and callback contract, on the market's chain |
| `src/StandbyWatcher.sol` | The reactive contract, on Reactive Lasna |
| `src/demo/` | A mintable token and a settable oracle for the testnet demo market, and `TryIt`, one public call that runs a loop |
| `script/Deploy.s.sol` | Deployment, in the order the two contracts need |
| `measure/` | The harness that runs loops on testnet, the verifier that reads them back from both chains, the race |
| `data/` | Every measured loop, with its three transaction hashes, and the statistics |
| `history/` | The study of five real Morpho markets: download, analysis, data |
| `test/` | 42 Foundry tests, run against the Morpho Blue bytecode deployed on Base Sepolia |

## Build and test

```bash
git clone --recurse-submodules https://github.com/big14way/standby && cd standby
forge test
```

No keys and no RPC endpoint are needed. The tests place the exact bytecode of Morpho Blue and of its
AdaptiveCurveIrm, as deployed on Base Sepolia, at the addresses they have there (`test/fixtures/`), and play
the Reactive Network with a relay that hands the watcher only the logs it is subscribed to and delivers the
callbacks it asks for. They cover:

- who may join, and that a ticket is capped at the lender's position;
- strict first-in, first-out payment, partial fills, and the queue's totals, including a fuzz test;
- repayments, third-party supply and liquidations all triggering a settlement;
- a callback that arrives after the liquidity is gone: it pays nothing and changes nothing;
- a lender who revoked the authorisation or already left Morpho: their ticket is voided, the next is paid;
- a queue longer than one callback serves: the watcher is told more is due and asks again;
- the refusals: `settle` called directly, or through the proxy by another reactive contract;
- the watcher's subscriptions opening when a queue forms and closing when it empties;
- a callback short of gas never voiding a ticket, and a full callback fitting its gas limit;
- the on-chain latency record.

## Credits

- [Morpho Blue](https://github.com/morpho-org/morpho-blue) (interfaces, share maths, and the protocol itself in tests)
- [reactive-lib-omni](https://github.com/Reactive-Network/reactive-lib-omni) (base contracts for reactive and callback contracts)
- [forge-std](https://github.com/foundry-rs/forge-std)

## License

MIT
