"use client";

import { useMemo, useState } from "react";
import { answerStatus } from "../lib/answer-engine.ts";
import { getState } from "../lib/data.ts";

const today = new Date().toISOString().slice(0, 10);

export default function Home() {
  const [location, setLocation] = useState("New York, NY");
  const [date, setDate] = useState(today);
  const answer = useMemo(() => {
    const state = getState(location.split(",").at(-1)?.trim() || location);
    return answerStatus({ location, stateCode: state?.stateCode, date, checkedAt: `${today}T12:00:00.000Z` });
  }, [location, date]);

  return (
    <main>
      <p className="eyebrow">ARE FLAGS LOWERED?</p>
      <h1>Why is the flag at half-mast?</h1>
      <p className="lede">A plain-language answer, backed by official U.S. orders.</p>

      <section className="lookup" aria-label="Flag status lookup">
        <label>
          Location
          <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="State or city, state" />
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
      </section>

      <section className={`answer answer-${answer.status}`} aria-live="polite">
        <p className="answer-kicker">{answer.date === today ? "Today" : answer.date}</p>
        <h2>{answer.status === "half_mast" ? "Yes — flags should be at half-mast." : "No — flags should be at full mast."}</h2>
        <p className="location">{answer.location}</p>

        <div className="flag-results">
          {answer.flagResults.map((result) => (
            <article key={result.flagType}>
              <h3>{result.label}</h3>
              <p className="flag-status">{result.status === "half_mast" ? "Half-mast" : result.status === "below_us" ? "Below U.S. flag" : result.status === "uncertain" ? "Needs review" : "Full mast"}</p>
              <p>{result.explanation}</p>
              {result.orders.map((order) => (
                <p className="order" key={order.id}>
                  <strong>{order.title}</strong><br />
                  Why: {order.reason}<br />
                  Where: {order.scope === "nationwide" ? "Nationwide" : order.jurisdiction.name}<br />
                  When: {order.effectiveStart} through {order.effectiveEnd || "further notice"}{order.effectiveEndTime ? ` at ${order.effectiveEndTime}` : order.effectiveEndCondition ? ` at ${order.effectiveEndCondition}` : ""}<br />
                  Authority: {order.issuingAuthority}<br />
                  <a href={order.sourceUrl} target="_blank" rel="noreferrer">Official source ↗</a>
                </p>
              ))}
            </article>
          ))}
        </div>
      </section>

      <footer>
        <p>{answer.coverageNotice}</p>
        <p>Data checked: {answer.lastCheckedAt.slice(0, 10)}</p>
      </footer>
    </main>
  );
}
