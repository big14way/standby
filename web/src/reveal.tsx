import { motion, useInView, useReducedMotion } from "motion/react";
import { type ReactNode, useRef } from "react";

export const EASE = [0.16, 1, 0.3, 1] as const;
const DURATION = 0.6;
/** Seconds between one word of a heading and the next. */
const WORD_STAGGER = 0.05;

/** Fade up 10px when scrolled into view, once. */
export function Reveal({
  children,
  delay = 0,
  className,
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: reduce ? 0 : 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: DURATION, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

type Part = string | { dim: string } | "\n";

/** A heading whose words fade up one after another. Parts are ink or dim; "\n" breaks the line. */
export function Words({
  as: Tag = "h2",
  className = "h2",
  parts,
  delay = 0,
  onLoad = false,
}: {
  as?: "h1" | "h2" | "p";
  className?: string;
  parts: Part[];
  delay?: number;
  onLoad?: boolean;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.3 });
  const reduce = useReducedMotion();
  const show = onLoad || seen;
  let i = 0;
  const label = parts.map((p) => (p === "\n" ? " " : typeof p === "string" ? p : p.dim)).join(" ");
  return (
    <Tag ref={ref as never} className={className} aria-label={label}>
      {parts.map((p, k) => {
        if (p === "\n") return <br key={k} />;
        const dim = typeof p !== "string";
        const words = (dim ? p.dim : p).split(" ");
        return (
          <span key={k} className={dim ? "dim" : undefined} aria-hidden>
            {words.map((w, j) => {
              const d = delay + i++ * WORD_STAGGER;
              return (
                <motion.span
                  key={j}
                  className="w"
                  initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                  animate={show ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: DURATION, ease: EASE, delay: d }}
                >
                  {w + " "}
                </motion.span>
              );
            })}
          </span>
        );
      })}
    </Tag>
  );
}
