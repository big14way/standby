#!/usr/bin/env python3
"""Race the queue against a rival lender who withdraws by hand, a chosen time after the repayment.

The rival is a second lender in the same market who is NOT in the queue. Each trial:
  1. The borrower repays X into the fully borrowed market.
  2. `delay` seconds later the rival sends `withdraw(X)` straight to Morpho, as a bot or a person would.
  3. The watcher's callback reaches the queue and tries to pay the queued lender X.

Only one of them can have the X. If the rival's withdrawal lands first it succeeds and the queue's
settlement pays nothing; if the settlement lands first, the rival's withdrawal reverts for lack of liquidity.

Both transactions are signed before the trial starts (`cast mktx`, no network) and submitted as raw
transactions, from two threads, so the delay between them is the script's sleep plus network jitter. The result is not binned
by the requested delay but by where the rival's transaction actually landed: rival block minus origin block.

Needs BORROWER_PRIVATE_KEY / BORROWER_ADDRESS and RIVAL_PRIVATE_KEY / RIVAL_ADDRESS.

  python3 measure/race.py --trials 150 --out data/race.jsonl
"""

import argparse
import json
import os
import random
import signal
import subprocess
import sys
import threading
import time

from common import BASE_RPC, LASNA_RPC, MARKET_PARAMS, MORPHO, MP_TYPE, WAD, block_number, receipt, rpc
from run import build_record

CHAIN_ID = 84532
GAS_LIMIT = 250_000

stopping = False


def _stop(*_):
    global stopping
    stopping = True


def sign(key, nonce, signature, *args, max_fee, tip):
    """Sign a transaction offline and return the raw hex."""
    cmd = ["cast", "mktx", MORPHO, signature, *[str(a) for a in args]]
    cmd += ["--nonce", str(nonce), "--gas-limit", str(GAS_LIMIT), "--gas-price", str(max_fee)]
    cmd += ["--priority-gas-price", str(tip), "--chain", str(CHAIN_ID), "--private-key", key]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"cast mktx failed: {(p.stderr or p.stdout).strip()[:300]}")
    return p.stdout.strip().splitlines()[-1]


def wait_receipt(tx, seconds=60):
    deadline = time.time() + seconds
    while time.time() < deadline:
        r = receipt(BASE_RPC, tx)
        if r is not None:
            return r
        time.sleep(0.25)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, required=True)
    ap.add_argument("--out", default="data/race.jsonl")
    ap.add_argument("--assets", type=int, default=100, help="amount per trial, whole loan tokens")
    ap.add_argument("--delay-min", type=float, default=0.0, help="seconds between the two submissions")
    ap.add_argument("--delay-max", type=float, default=3.0)
    a = ap.parse_args()

    bkey, borrower = os.environ["BORROWER_PRIVATE_KEY"], os.environ["BORROWER_ADDRESS"]
    rkey, rival = os.environ["RIVAL_PRIVATE_KEY"], os.environ["RIVAL_ADDRESS"]
    assets = a.assets * WAD

    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    done = 0
    if os.path.exists(a.out):
        with open(a.out) as f:
            done = sum(1 for line in f if line.strip())

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)

    for i in range(a.trials):
        if stopping:
            print("stopped on request", flush=True)
            return 1
        n = done + i + 1
        delay = random.uniform(a.delay_min, a.delay_max)

        base_fee = int(rpc(BASE_RPC, "eth_getBlockByNumber", ["latest", False])["baseFeePerGas"], 16)
        tip = int(rpc(BASE_RPC, "eth_maxPriorityFeePerGas", []), 16)
        max_fee = base_fee * 3 + tip
        bn = int(rpc(BASE_RPC, "eth_getTransactionCount", [borrower, "pending"]), 16)
        rn = int(rpc(BASE_RPC, "eth_getTransactionCount", [rival, "pending"]), 16)
        raw_repay = sign(
            bkey, bn, f"repay({MP_TYPE},uint256,uint256,address,bytes)", MARKET_PARAMS, assets, 0, borrower, "0x",
            max_fee=max_fee, tip=tip,
        )
        # Both sides pay the same fee: the rival gets no priority and gives none away.
        raw_withdraw = sign(
            rkey, rn, f"withdraw({MP_TYPE},uint256,uint256,address,address)", MARKET_PARAMS, assets, 0, rival, rival,
            max_fee=max_fee, tip=tip,
        )
        lasna_from = block_number(LASNA_RPC) - 2

        # Submit from two threads so the gap between the submissions is the chosen delay, not the delay plus
        # the time the first HTTP call takes. A negative delay submits the rival's transaction first.
        sent = {}

        def submit(name, raw):
            try:
                sent[name] = rpc(BASE_RPC, "eth_sendRawTransaction", [raw], tries=1)
            except Exception as e:  # noqa: BLE001 - a failed submission voids the trial, nothing more
                sent[name] = e

        first, second = ("origin", raw_repay), ("rival", raw_withdraw)
        if delay < 0:
            first, second = second, first
        t1 = threading.Thread(target=submit, args=first)
        t2 = threading.Thread(target=submit, args=second)
        t1.start()
        time.sleep(abs(delay))
        t2.start()
        t1.join()
        t2.join()
        origin_tx, rival_tx = sent["origin"], sent["rival"]
        if isinstance(origin_tx, Exception) or isinstance(rival_tx, Exception):
            print(f"{n}: submission failed, trial skipped ({str(origin_tx)[:80]} / {str(rival_tx)[:80]})", flush=True)
            time.sleep(5)
            continue

        o = wait_receipt(origin_tx)
        v = wait_receipt(rival_tx)
        if o is None or v is None or int(o["status"], 16) != 1:
            print(f"{n}: trial did not complete (origin {origin_tx}, rival {rival_tx})", flush=True)
            time.sleep(3)
            continue

        origin_block = int(o["blockNumber"], 16)
        rec = build_record(n, "repay", assets, origin_tx, origin_block, lasna_from)
        rec["requestedDelayS"] = round(delay, 3)
        rec["rival"] = {
            "tx": rival_tx,
            "block": int(v["blockNumber"], 16),
            "index": int(v["transactionIndex"], 16),
            "succeeded": int(v["status"], 16) == 1,
        }
        rec["origin"]["index"] = int(o["transactionIndex"], 16)
        rec["rivalGapBlocks"] = rec["rival"]["block"] - origin_block
        early = rec["rivalGapBlocks"] < 0 or (
            rec["rivalGapBlocks"] == 0 and rec["rival"]["index"] < rec["origin"]["index"]
        )
        if early:
            # The withdrawal landed before the repayment it was meant to chase: no race took place.
            rec["winner"] = "void"
        elif rec["settlement"]:
            s = receipt(BASE_RPC, rec["settlement"]["tx"])
            rec["settlement"]["index"] = int(s["transactionIndex"], 16)
            paid = int(rec["settlement"]["assetsPaid"])
            if paid == assets and not rec["rival"]["succeeded"]:
                rec["winner"] = "queue"
            elif paid == 0 and rec["rival"]["succeeded"]:
                rec["winner"] = "rival"
            else:
                rec["winner"] = "unclear"
        else:
            rec["winner"] = "rival" if rec["rival"]["succeeded"] else "nobody"

        with open(a.out, "a") as f:
            f.write(json.dumps(rec) + "\n")
        print(
            f"{n}: rival landed {rec['rivalGapBlocks']} blocks after the repayment, "
            f"settlement {rec.get('lagBlocks', '-')} -> {rec['winner']}",
            flush=True,
        )
        time.sleep(random.uniform(0.5, 2.0))


if __name__ == "__main__":
    sys.exit(main())
