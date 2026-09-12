"use client";

import { useEffect, useState } from "react";
import { answerStatus } from "../lib/answer-engine.ts";
import { jurisdictionCatalog } from "../lib/jurisdictions.ts";
import type { StatusAnswer, FlagResult, Jurisdiction } from "../lib/types.ts";

const today = new Date().toISOString().slice(0, 10);
const defaultState = jurisdictionCatalog.find((value) => value.stateCode === "VA")!;

function statusLabel(status: FlagResult["status"]) {
  return status === "half_mast" ? "Half-mast" : status === "below_us" ? "Below U.S. flag" : status === "uncertain" ? "Needs review" : "Full mast";
}

function statusWord(status: StatusAnswer["status"]) {
  return status === "half_mast" ? "Yes." : status === "uncertain" ? "Not sure." : "No.";
}

function dateText(order: FlagResult["orders"][number]) {
  if (!order.effectiveEnd || order.effectiveEnd === order.effectiveStart) return `On ${order.effectiveStart}`;
  return `Until ${order.effectiveEnd}${order.effectiveEndCondition ? ` at ${order.effectiveEndCondition}` : ""}`;
}

function fallbackAnswer(state: Jurisdiction, date: string) {
  return answerStatus({ location: state.name, stateCode: state.stateCode, date, checkedAt: `${today}T12:00:00.000Z` });
}

export default function Home() {
  const [selectedState, setSelectedState] = useState(defaultState);
  const [answer, setAnswer] = useState<StatusAnswer>(() => fallbackAnswer(defaultState, today));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ location: selectedState.name, state: selectedState.stateCode || "", date: today });
    fetch(`/api/status?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Status unavailable");
        return response.json() as Promise<StatusAnswer>;
      })
      .then(setAnswer)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAnswer(fallbackAnswer(selectedState, today));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [selectedState]);

  const usResult = answer.flagResults.find((result) => result.flagType === "us");
  const stateResult = answer.flagResults.find((result) => result.flagType === "state");
  const leadOrder = usResult?.orders[0] || stateResult?.orders[0];
  const reason = leadOrder?.reason || (stateResult?.status === "uncertain" ? "The official source needs review before we can give a definitive answer." : stateResult?.status === "half_mast" ? stateResult.explanation : usResult?.status === "uncertain" ? "The official source needs review before we can give a definitive answer." : usResult?.explanation);
  const sourceUrl = leadOrder?.sourceUrl || answer.sourceLinks[0];
  const explanation = (() => {
    if (usResult?.status === "half_mast" && stateResult?.status === "half_mast") return "All flags to be flown at half-mast";
    if (usResult?.status === "half_mast") return "The U.S. flag is to be flown at half-mast";
    if (stateResult?.status === "half_mast") return `${selectedState.name}'s flag is to be flown at half-mast`;
    if (answer.status === "uncertain") return "The current status needs review";
    return "Flags to be flown at full mast";
  })();

  return (
    <main className={`status-page status-${answer.status}`}>
      <header className="masthead">
        <p className="brand">AreFlagsLowered?</p>
        <p className="brand-answer" aria-live="polite">{statusWord(answer.status)}</p>
      </header>

      <section className="hero" aria-labelledby="status-heading">
        <h1 id="status-heading" className="sr-only">Current flag status</h1>
        <div className="flag-heading">
          <h2>United States</h2>
          <label className="state-picker">
            <span className="sr-only">Choose a state</span>
            <select value={selectedState.stateCode} onChange={(event) => { setLoading(true); setSelectedState(jurisdictionCatalog.find((state) => state.stateCode === event.target.value) || defaultState); }}>
              {jurisdictionCatalog.map((state) => <option key={state.id} value={state.stateCode}>{state.name}</option>)}
            </select>
            <span className="chevron" aria-hidden="true">⌄</span>
          </label>
        </div>

        <div className="flags" aria-label="Current flag positions">
          <FlagDisplay result={usResult} kind="us" />
          <FlagDisplay result={stateResult} kind="state" stateName={selectedState.name} stateCode={selectedState.stateCode} />
        </div>

        <div className="status-copy">
          <p className="status-explanation">{explanation}</p>
          <p className="reason"><strong>Why?</strong> <span>{reason || "No current official order found."}</span></p>
          {leadOrder && <p className="timing">{dateText(leadOrder)}</p>}
          <div className="meta-row">
            <span>{loading ? "Checking official sources…" : `Checked ${new Date(answer.lastCheckedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`}</span>
            {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">Official source ↗</a>}
          </div>
        </div>
      </section>

    </main>
  );
}

function FlagDisplay({ result, kind, stateName, stateCode }: { result?: FlagResult; kind: "us" | "state"; stateName?: string; stateCode?: string }) {
  const status = result?.status || "uncertain";
  return (
    <article className={`flag-display flag-${kind} flag-${status} ${stateCode ? `flag-state-${stateCode}` : ""}`}>
      <div className="flag-stage" aria-hidden="true">
        <div className="flag-pole" />
        <div className="flag-cloth"><span /><span /><span /><span /><span /></div>
      </div>
      <p className="flag-name">{kind === "us" ? "U.S. flag" : `${stateName} flag`}</p>
      <p className="flag-status">{statusLabel(status)}</p>
    </article>
  );
}
