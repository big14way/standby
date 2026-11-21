import { createPublicClient, createWalletClient, custom, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

import { MARKET_ID, QUEUE, TRY_IT } from "./lib";

const queueAbi = parseAbi([
  "function loops() view returns (uint64)",
  "function loopsThatPaid() view returns (uint64)",
  "function openTickets(bytes32) view returns (uint256)",
  "function pendingAssets(bytes32) view returns (uint256)",
  "event Loop(bytes32 indexed id, uint256 originBlock, uint256 settledBlock, uint256 originTxHash, uint256 assetsPaid, uint256 tickets)",
]);
const tryItAbi = parseAbi(["function tryIt() returns (uint256)", "function tryCount() view returns (uint256)"]);

const pub = createPublicClient({ chain: baseSepolia, transport: http("https://sepolia.base.org") });
const queue = { address: QUEUE as `0x${string}`, abi: queueAbi } as const;
const id = MARKET_ID as `0x${string}`;

/** The public endpoint refuses eth_getLogs over more than 200 blocks. */
const MAX_LOG_RANGE = 190n;

export type QueueState = { loops: number; loopsThatPaid: number; openTickets: number; pending: number; tries: number };

export async function readQueue(): Promise<QueueState> {
  const [loops, paid, open, pending, tries] = await Promise.all([
    pub.readContract({ ...queue, functionName: "loops" }),
    pub.readContract({ ...queue, functionName: "loopsThatPaid" }),
    pub.readContract({ ...queue, functionName: "openTickets", args: [id] }),
    pub.readContract({ ...queue, functionName: "pendingAssets", args: [id] }),
    pub.readContract({ address: TRY_IT as `0x${string}`, abi: tryItAbi, functionName: "tryCount" }),
  ]);
  return {
    loops: Number(loops),
    loopsThatPaid: Number(paid),
    openTickets: Number(open),
    pending: Number(pending / 10n ** 16n) / 100,
    tries: Number(tries),
  };
}

export type Sent = { hash: `0x${string}`; block: number };
export type Settled = { tx: `0x${string}`; block: number; lag: number; paid: number };

type Injected = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };

/** Send `tryIt()` from the visitor's wallet and wait for it to be mined. */
export async function sendTryIt(onStage: (s: string) => void): Promise<Sent> {
  const eth = (window as unknown as { ethereum?: Injected }).ethereum;
  if (!eth) throw new Error("No wallet found in this browser. The same call from a terminal is in the README.");
  const wallet = createWalletClient({ chain: baseSepolia, transport: custom(eth) });
  onStage("Waiting for the wallet");
  const [account] = await wallet.requestAddresses();
  try {
    await wallet.switchChain({ id: baseSepolia.id });
  } catch (e) {
    if ((e as { code?: number }).code !== 4902) throw e;
    await wallet.addChain({ chain: baseSepolia });
  }
  onStage("Confirm tryIt() in the wallet");
  const hash = await wallet.writeContract({
    account,
    address: TRY_IT as `0x${string}`,
    abi: tryItAbi,
    functionName: "tryIt",
  });
  onStage("Repayment sent");
  const receipt = await pub.waitForTransactionReceipt({ hash, pollingInterval: 400 });
  if (receipt.status !== "success") throw new Error("The transaction reverted. The queue may be empty.");
  return { hash, block: Number(receipt.blockNumber) };
}

/** Wait for the queue's `Loop` event that names this origin transaction: the payment it did not send. */
export async function waitForLoop(sent: Sent, timeoutMs = 45_000): Promise<Settled | null> {
  const want = BigInt(sent.hash);
  const from = BigInt(sent.block);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const head = await pub.getBlockNumber();
    const to = head > from + MAX_LOG_RANGE ? from + MAX_LOG_RANGE : head;
    const logs = await pub.getLogs({
      address: queue.address,
      event: queueAbi[4],
      args: { id },
      fromBlock: from,
      toBlock: to,
    });
    const hit = logs.find((l) => l.args.originTxHash === want);
    if (hit) {
      const block = Number(hit.blockNumber);
      return {
        tx: hit.transactionHash,
        block,
        lag: block - sent.block,
        paid: Number((hit.args.assetsPaid ?? 0n) / 10n ** 16n) / 100,
      };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}
