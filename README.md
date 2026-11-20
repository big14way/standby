# Standby

**An exit queue for lending markets that have run dry, settled by the Reactive Network.**

When a Morpho Blue market is fully borrowed, lenders cannot withdraw. Liquidity comes back when a borrower
repays, someone supplies, or a position is liquidated, and it goes to whoever withdraws first. Standby lets a
lender queue once and be paid the moment liquidity returns, in order of arrival, with nothing of theirs running.

Built for the Reactive Omni Buildathon, track *Every Second Counts*. Work in progress: the contracts are
deployed on testnet and the first loops have run; a full latency study and a demo follow.

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

Five Base Sepolia blocks from repayment to payout. At 0.2 s a block that is 1.0 s. This is one loop, not a
statistic; the measured distribution comes next. Latency is counted in Base Sepolia blocks, because the origin
event and the payout are on the same chain and its blocks are 0.2 s apart. The queue records it itself: the
`Loop` event of the settlement carries the origin block and the origin transaction hash.

An earlier deployment (queue `0xC0BAA9aFe6C810b584D52e6b1EE5a849CA538642`, watcher
`0x9F0c2ca01276d9d7AA064b876bcf2b0b9880E9bc`) ran the very first loop in nine blocks. It was replaced after
testnet use showed that a wallet's gas estimate for `join` skipped the on-the-spot payment; `join` now reverts
when it is sent too little gas to pay.

## Layout

| Path | What |
|---|---|
| `src/StandbyQueue.sol` | The queue and callback contract, on the market's chain |
| `src/StandbyWatcher.sol` | The reactive contract, on Reactive Lasna |
| `src/demo/` | A mintable token and a settable oracle for the testnet demo market |
| `script/Deploy.s.sol` | Deployment, in the order the two contracts need |
| `measure/` | The harness that runs loops on testnet and records the three transactions of each |
| `test/` | 40 Foundry tests, run against the Morpho Blue bytecode deployed on Base Sepolia |

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
