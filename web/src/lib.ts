import raw from "./data.json";

export type Loop = {
  n: number;
  cause: string;
  assets: number;
  lag: number;
  originBlock: number;
  origin: string;
  reactive: string;
  settlement: string;
};

export const data = raw as unknown as {
  loops: Loop[];
  blocks: { n: number; min: number; median: number; p90: number; p99: number; max: number };
  histogram: Record<string, number>;
  race: { trials: number; counted: number; byGap: Record<string, { trials: number; queue: number; rival: number }> };
};

/** Base Sepolia produces a block every 0.2 s. */
export const BLOCK_S = 0.2;

export const QUEUE = "0x757CD246b40A7D58c178ABb7CCEDa5Fb60BFf926";
export const WATCHER = "0x9FA9c9876325Fd30f5e62D97DbC5A543dAc24414";
export const TRY_IT = "0x7Bb5EC188C91e91feC5d430944d551Ce8C6b8ffE";
export const MORPHO = "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb";
export const MARKET_ID = "0x321754d492bcd755a8b2be25eb2662875a132880158d8975b21e823853bd237a";

export const REPO = "https://github.com/big14way/standby";
export const BASESCAN = "https://sepolia.basescan.org";
export const REACTSCAN = "https://lasna.reactscan.net";

export const short = (h: string, a = 6, b = 4) => `${h.slice(0, a)}…${h.slice(-b)}`;
export const num = (n: number, d = 0) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const secs = (blocks: number) => (blocks * BLOCK_S).toFixed(1);

/** Colours the canvases draw with, read from the page's tokens so both themes work. */
export function palette() {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    dark: document.documentElement.dataset.theme === "dark",
    canvas: v("--canvas"),
    ink: v("--ink"),
    muted: v("--muted"),
    faint: v("--faint"),
    blue: v("--blue"),
    soft: v("--blue-soft"),
    surface: v("--surface"),
  };
}

export const reducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
