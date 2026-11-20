"""Shared by the measurement scripts: addresses, event topics and a small JSON-RPC client.

Standard library only. Transactions are signed and sent with Foundry's `cast`.
"""

import json
import subprocess
import time
import urllib.request

BASE_RPC = "https://sepolia.base.org"
LASNA_RPC = "https://lasna-rpc.rnk.dev/"

MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb"
QUEUE = "0x757CD246b40A7D58c178ABb7CCEDa5Fb60BFf926"
WATCHER = "0x9FA9c9876325Fd30f5e62D97DbC5A543dAc24414"

LOAN_TOKEN = "0xa600E633cDbBe3003D6626e1b37dB0dbE0AaaF49"  # sbUSD
COLLATERAL_TOKEN = "0x039217f10c00642A52144eB4a8dd24972e246F72"  # sbETH
ORACLE = "0xFb6931BD12e428191b193211002D190C49470e5f"
IRM = "0x46415998764C29aB2a25CbeA6254146D50D22687"
LLTV = 860000000000000000
MARKET_ID = "0x321754d492bcd755a8b2be25eb2662875a132880158d8975b21e823853bd237a"

MARKET_PARAMS = f"({LOAN_TOKEN},{COLLATERAL_TOKEN},{ORACLE},{IRM},{LLTV})"
MP_TYPE = "(address,address,address,address,uint256)"

# keccak256("Loop(bytes32,uint256,uint256,uint256,uint256,uint256)"), emitted by the queue on Base Sepolia.
LOOP_TOPIC = "0x58840050fb755fa468d0b06b1692c90dd928e6b6fd30bc2e39b64d5246a6228b"
# keccak256("SettlementRequested(uint256,uint8,uint256,uint256,uint256)"), emitted by the watcher on Lasna.
REQUESTED_TOPIC = "0xd7c41aea8c5651afcfda2fa3fb32f3033b2fb27a4318e96ba975a03552acdebc"

# The public Base Sepolia endpoint refuses eth_getLogs over more than 200 blocks.
MAX_LOG_RANGE = 190

WAD = 10**18


def rpc(url, method, params, tries=8):
    """One JSON-RPC call, retried with a growing pause on transport errors and rate limits."""
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    pause = 0.4
    last = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(
                url, data=body, headers={"Content-Type": "application/json", "User-Agent": "standby-measure"}
            )
            with urllib.request.urlopen(req, timeout=20) as r:
                out = json.loads(r.read())
            if "error" in out:
                last = RuntimeError(f"{method}: {out['error']}")
            else:
                return out["result"]
        except Exception as e:  # noqa: BLE001 - any transport failure is retried
            last = e
        time.sleep(pause)
        pause = min(pause * 1.7, 5)
    raise last


def words(data_hex):
    """Split ABI-encoded event data into 32-byte integers."""
    d = data_hex[2:]
    return [int(d[i : i + 64], 16) for i in range(0, len(d), 64)]


def block_number(url):
    return int(rpc(url, "eth_blockNumber", []), 16)


def block(url, number):
    return rpc(url, "eth_getBlockByNumber", [hex(number), False])


def receipt(url, tx_hash):
    return rpc(url, "eth_getTransactionReceipt", [tx_hash])


def base_block_ms(number):
    """Timestamp of a Base Sepolia block in milliseconds (Base publishes `timestampMs`)."""
    b = block(BASE_RPC, number)
    if b.get("timestampMs"):
        return int(b["timestampMs"], 16)
    return int(b["timestamp"], 16) * 1000


def lasna_block_s(number):
    """Timestamp of a Lasna block. Lasna publishes whole seconds only."""
    return int(block(LASNA_RPC, number)["timestamp"], 16)


def cast_send(private_key, to, signature, *args, value=None, gas_limit=None, rpc_url=BASE_RPC):
    """Sign and send with `cast`, wait for the receipt, return it as a dict.

    `cast` is asked only to submit (`--async`); the receipt is polled here several times a second, because
    cast's own polling interval is longer than a whole loop takes.
    """
    cmd = ["cast", "send", to, signature, *[str(a) for a in args], "--rpc-url", rpc_url, "--async"]
    if value is not None:
        cmd += ["--value", str(value)]
    if gas_limit is not None:
        cmd += ["--gas-limit", str(gas_limit)]
    cmd += ["--private-key", private_key]
    last = None
    for _ in range(4):
        p = subprocess.run(cmd, capture_output=True, text=True)
        tx = p.stdout.strip().splitlines()[-1].strip() if p.returncode == 0 and p.stdout.strip() else ""
        if tx.startswith("0x") and len(tx) == 66:
            deadline = time.time() + 90
            while time.time() < deadline:
                r = receipt(rpc_url, tx)
                if r is not None:
                    return r
                time.sleep(0.25)
            raise RuntimeError(f"no receipt for {tx} after 90 s")
        last = (p.stderr or p.stdout).strip().splitlines()[-1:] or ["cast failed"]
        time.sleep(2)
    raise RuntimeError(f"cast send failed: {last[0][:300]}")
