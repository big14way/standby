#!/usr/bin/env python3
"""Download the full supply / withdraw / borrow / repay / liquidation history of one Morpho Blue market
from Morpho's public API (https://blue-api.morpho.org/graphql) and save it as JSON lines, oldest first.

  python3 history/fetch.py 1 0x8e7cc042d739a365c43d0a52d5f24160fa7ae9b7e7c9a479bd02a56041d4cf77
"""

import json
import os
import sys
import time
import urllib.request

API = "https://blue-api.morpho.org/graphql"
PAGE = 1000

QUERY = """
query($ids: [String!], $chains: [Int!], $first: Int, $skip: Int, $since: Int) {
  marketTransactions(first: $first, skip: $skip, orderBy: Timestamp, orderDirection: Asc,
    where: { marketUniqueKey_in: $ids, chainId_in: $chains, timestamp_gte: $since, type_in: [Supply, Withdraw, Borrow, Repay, Liquidation] }) {
    pageInfo { countTotal count }
    items {
      txHash timestamp blockNumber txIndex logIndex type
      user { address }
      data {
        ... on MarketTransactionTransferData { assets shares }
        ... on MarketTransactionLiquidationData { liquidator repaidAssets seizedAssets badDebtAssets }
      }
    }
  }
}
"""


def post(variables, tries=6):
    body = json.dumps({"query": QUERY, "variables": variables}).encode()
    pause = 2
    for _ in range(tries):
        try:
            req = urllib.request.Request(
                API, data=body, headers={"Content-Type": "application/json", "User-Agent": "standby-history"}
            )
            with urllib.request.urlopen(req, timeout=90) as r:
                out = json.loads(r.read())
            if "errors" not in out:
                return out["data"]["marketTransactions"]
            err = out["errors"]
        except Exception as e:  # noqa: BLE001
            err = e
        time.sleep(pause)
        pause *= 2
    raise RuntimeError(f"API failed: {str(err)[:300]}")


def main():
    chain, market = int(sys.argv[1]), sys.argv[2].lower()
    count_only = len(sys.argv) > 3 and sys.argv[3] == "--count"
    out_path = os.path.join(os.path.dirname(__file__), "data", f"{chain}-{market[:10]}.jsonl")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    # The API refuses `skip` above 10,000, so page by time: each request starts at the newest timestamp seen
    # so far, and `skip` only steps through that one window. Rows seen twice are dropped.
    seen, items, since, skip, total = set(), [], 0, 0, None
    while True:
        page = post({"ids": [market], "chains": [chain], "first": 1 if count_only else PAGE, "skip": skip, "since": since})
        if total is None:
            total = page["pageInfo"]["countTotal"]
        if count_only:
            print(total)
            return
        got = page["items"]
        for t in got:
            key = (t["txHash"], t["logIndex"])
            if key not in seen:
                seen.add(key)
                items.append(t)
        print(f"{len(items)} / {total}", file=sys.stderr)
        if len(got) < PAGE:
            break
        newest = max(int(t["timestamp"]) for t in got)
        if newest > since:
            since, skip = newest, 0
        else:
            skip += len(got)  # a whole page inside one second: step through it

    if len(items) != total:
        print(f"warning: got {len(items)} of {total}", file=sys.stderr)

    # The API orders by timestamp; within a block, order by position in the block.
    items.sort(key=lambda t: (int(t["blockNumber"]), t["txIndex"], t["logIndex"]))
    with open(out_path, "w") as f:
        for t in items:
            f.write(json.dumps(t) + "\n")
    print(f"{len(items)} transactions -> {out_path}")


if __name__ == "__main__":
    main()
