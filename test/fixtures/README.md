# Fixtures

Runtime bytecode read from Base Sepolia (chain 84532) at block 60,829,004 with `cast code`:

| File | Contract | Address | Code hash |
|---|---|---|---|
| `morpho-blue.hex` | Morpho Blue | `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb` | `0xde5df0406e830f48506c94032a90a393b444b3de1cd5340d8c1a131a41189d3d` |
| `adaptive-curve-irm.hex` | AdaptiveCurveIrm | `0x46415998764C29aB2a25CbeA6254146D50D22687` | `0x9978b522abfe0f3b8279800375d833b9d9660ae4f6321a2efb1f1f98850a0cbe` |

The tests place this bytecode at the same addresses, so they run against the code that is live on the
testnet, not a recompilation of it. A test checks the hashes. To read them again:

```bash
cast code 0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb --rpc-url https://sepolia.base.org > test/fixtures/morpho-blue.hex
cast code 0x46415998764C29aB2a25CbeA6254146D50D22687 --rpc-url https://sepolia.base.org > test/fixtures/adaptive-curve-irm.hex
```

Morpho Blue is the work of Morpho Labs: https://github.com/morpho-org/morpho-blue
