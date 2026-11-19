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
| `StandbyWatcher` | Reactive Lasna (5318007) | [`0x9F0c2ca01276d9d7AA064b876bcf2b0b9880E9bc`](https://lasna.reactscan.net/address/0x9F0c2ca01276d9d7AA064b876bcf2b0b9880E9bc) |
| `StandbyQueue` | Base Sepolia (84532) | [`0xC0BAA9aFe6C810b584D52e6b1EE5a849CA538642`](https://sepolia.basescan.org/address/0xC0BAA9aFe6C810b584D52e6b1EE5a849CA538642) |
| Morpho Blue (not ours) | Base Sepolia | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` |

The demo market is our own market on the real Morpho Blue: test tokens sbUSD
(`0xa600E633cDbBe3003D6626e1b37dB0dbE0AaaF49`) and sbETH (`0x039217f10c00642A52144eB4a8dd24972e246F72`), an oracle
we set (`0xFb6931BD12e428191b193211002D190C49470e5f`), Morpho's AdaptiveCurveIrm and an 86% LLTV. Market id
`0x321754d492bcd755a8b2be25eb2662875a132880158d8975b21e823853bd237a`.

### The first loop

The market was fully borrowed and one lender was queued for 30,000 sbUSD. A borrower repaid 10,000.

| Step | Chain | Block | Transaction |
|---|---|---|---|
| Repayment (the origin event) | Base Sepolia | 60,836,197 | [`0x831927d2…b449e6`](https://sepolia.basescan.org/tx/0x831927d241adec2e0238eafafe303908bd8061eddd5e9ec52231438e54b449e6) |
| Watcher reacts, requests the callback | Reactive Lasna | 8,731,321 | [`0x1aa61dbf…0d5fb1`](https://lasna.reactscan.net/tx/0x1aa61dbf8753adaf6bc1d2a620b66ed3ded5ea1c859747a3c9b0d2883a0d5fb1) |
| Queue settles, pays the lender 10,000 | Base Sepolia | 60,836,206 | [`0xb82b7cb2…4d306c`](https://sepolia.basescan.org/tx/0xb82b7cb2c8fb96ff5bc2744d718bcdc3e6b98a9219da1d7533f21d240d4d306c) |

Nine Base Sepolia blocks from repayment to payout. At 0.2 s a block that is 1.8 s. This is one loop, not a
statistic; the measured distribution comes next. Base Sepolia's block timestamps are whole seconds, so latency
here is counted in blocks, and the queue records it itself: the `Loop` event of the settlement carries the
origin block and the origin transaction hash.

## Layout

| Path | What |
|---|---|
| `src/StandbyQueue.sol` | The queue and callback contract, on the market's chain |
| `src/StandbyWatcher.sol` | The reactive contract, on Reactive Lasna |
| `src/demo/` | A mintable token and a settable oracle for the testnet demo market |
| `script/Deploy.s.sol` | Deployment, in the order the two contracts need |
| `test/` | 38 Foundry tests, run against the Morpho Blue bytecode deployed on Base Sepolia |

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
