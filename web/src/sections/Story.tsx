import { Arrow } from "../icons";
import { REPO, data } from "../lib";
import { Reveal, Words } from "../reveal";

// The race, summed from the trials: rivals landing 10 or more blocks after the repayment, and 0 to 4.
const sum = (from: number, to: number) =>
  Object.entries(data.race.byGap)
    .filter(([g]) => +g >= from && +g <= to)
    .reduce((a, [, v]) => ({ trials: a.trials + v.trials, queue: a.queue + v.queue }), { trials: 0, queue: 0 });
const late = sum(10, 1e9);
const early = sum(0, 4);

export function Story() {
  return (
    <section className="section" id="race">
      <div className="container">
        <div className="story-card">
          <div className="story-main">
            <Words
              as="p"
              className="quote"
              parts={["Two seconds behind, a rival lost every race. Inside one second, it won them all."]}
            />
            <Reveal delay={0.2}>
              <p className="by">
                <b>The race</b>
                {data.race.trials} trials against a second lender withdrawing by hand
              </p>
            </Reveal>
            <Reveal delay={0.26}>
              <a className="link" href={`${REPO}#the-race-what-a-second-buys`} target="_blank" rel="noreferrer">
                <span>Read the method</span>
                <Arrow />
              </a>
            </Reveal>
          </div>
          <Reveal className="story-side" delay={0.1}>
            <div className="story-mark">
              <i style={{ height: 16 }} />
              <i style={{ height: 10 }} />
              data/race.jsonl
            </div>
            <div className="metrics">
              <div className="metric">
                <div className="v">
                  {late.queue}
                  <small>/{late.trials}</small>
                </div>
                <div className="caps">Queue first, rival at 2.0 s or later</div>
              </div>
              <div className="metric">
                <div className="v">
                  {early.queue}
                  <small>/{early.trials}</small>
                </div>
                <div className="caps">Queue first, rival inside 0.8 s</div>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
