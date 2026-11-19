# Standby

**An exit queue for lending markets that have run dry, settled by the Reactive Network.**

When a Morpho Blue market is fully borrowed, lenders cannot withdraw. Liquidity comes back when a borrower
repays, someone supplies, or a position is liquidated, and it goes to whoever withdraws first. Standby lets a
lender queue once and be paid the moment liquidity returns, in order of arrival, with nothing of theirs running.

Built for the Reactive Omni Buildathon, track *Every Second Counts*. Work in progress: the contracts are here;
tests, testnet deployment, measured latency and a demo follow.

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

## Build

```bash
git clone --recurse-submodules https://github.com/big14way/standby && cd standby
forge build
```

## Credits

- [Morpho Blue](https://github.com/morpho-org/morpho-blue) (interfaces, share maths, and the protocol itself in tests)
- [reactive-lib-omni](https://github.com/Reactive-Network/reactive-lib-omni) (base contracts for reactive and callback contracts)
- [forge-std](https://github.com/foundry-rs/forge-std)

## License

MIT
