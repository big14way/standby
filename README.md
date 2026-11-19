# Standby

**An exit queue for lending markets that have run dry, settled by the Reactive Network.**

When a Morpho Blue market is fully borrowed, lenders cannot withdraw. Liquidity comes back when a borrower
repays, someone supplies, or a position is liquidated, and it goes to whoever withdraws first. Standby lets a
lender queue once and be paid the moment liquidity returns, in order of arrival, with nothing of theirs running.

Built for the Reactive Omni Buildathon, track *Every Second Counts*. Work in progress: the contracts and
their tests are here; testnet deployment, measured latency and a demo follow.

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
