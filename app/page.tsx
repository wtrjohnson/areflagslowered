"use client";

import { useEffect, useRef, useState } from "react";
import { answerStatus } from "../lib/answer-engine.ts";
import { jurisdictionCatalog } from "../lib/jurisdictions.ts";
import type { StatusAnswer, FlagResult, Jurisdiction } from "../lib/types.ts";

const today = new Date().toISOString().slice(0, 10);
const defaultState = jurisdictionCatalog.find((value) => value.stateCode === "VA")!;
type MenuStatus = "half_mast" | "full_mast" | "below_us" | "uncertain";

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

function menuStatusLabel(status: MenuStatus) {
  return status === "half_mast" ? "Half-mast" : status === "below_us" ? "Below U.S." : status === "uncertain" ? "Review" : "Full mast";
}

export default function Home() {
  const [selectedState, setSelectedState] = useState(defaultState);
  const [stateOpen, setStateOpen] = useState(false);
  const [activeStateIndex, setActiveStateIndex] = useState(() => jurisdictionCatalog.findIndex((state) => state.id === defaultState.id));
  const [menuStatuses, setMenuStatuses] = useState<Record<string, MenuStatus>>({});
  const [answer, setAnswer] = useState<StatusAnswer>(() => fallbackAnswer(defaultState, today));
  const [loading, setLoading] = useState(true);
  const statePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (statePickerRef.current && !statePickerRef.current.contains(event.target as Node)) setStateOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    fetch("/api/status?all=true", { signal: AbortSignal.timeout(10000) })
      .then(async (response) => {
        if (!response.ok) throw new Error("Status list unavailable");
        return response.json() as Promise<{ statuses: Array<{ jurisdiction: { id: string }; status: { flagType: string; status: MenuStatus } }> }>;
      })
      .then((payload) => {
        const nextStatuses: Record<string, MenuStatus> = {};
        for (const row of payload.statuses) {
          if (row.status.flagType === "state") nextStatuses[row.jurisdiction.id] = row.status.status;
        }
        setMenuStatuses(nextStatuses);
      })
      .catch(() => setMenuStatuses({}));
  }, []);

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
    return "";
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
          <div className="state-picker" ref={statePickerRef}>
            <span className="sr-only">Choose a state</span>
            <button
              type="button"
              className="state-trigger"
              aria-haspopup="listbox"
              aria-expanded={stateOpen}
              aria-controls="state-listbox"
              onClick={() => { setActiveStateIndex(jurisdictionCatalog.findIndex((state) => state.id === selectedState.id)); setStateOpen((open) => !open); }}
              onKeyDown={(event) => {
                if (event.key === "Escape") { setStateOpen(false); return; }
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  const direction = event.key === "ArrowDown" ? 1 : -1;
                  setStateOpen(true);
                  setActiveStateIndex((index) => (index + direction + jurisdictionCatalog.length) % jurisdictionCatalog.length);
                }
                if ((event.key === "Enter" || event.key === " ") && stateOpen) {
                  event.preventDefault();
                  const nextState = jurisdictionCatalog[activeStateIndex];
                  setLoading(true); setSelectedState(nextState); setStateOpen(false);
                }
              }}
            >
              <span>{selectedState.name}</span><span className="chevron" aria-hidden="true">⌄</span>
            </button>
            {stateOpen && <div id="state-listbox" className="state-menu" role="listbox" aria-label="Choose a state">
              {jurisdictionCatalog.map((state, index) => <button
                type="button"
                role="option"
                id={`state-option-${state.id}`}
                className={`state-option ${state.id === selectedState.id ? "selected" : ""} ${index === activeStateIndex ? "active" : ""}`}
                aria-selected={state.id === selectedState.id}
                key={state.id}
                onMouseEnter={() => setActiveStateIndex(index)}
                onClick={() => { setLoading(true); setSelectedState(state); setActiveStateIndex(index); setStateOpen(false); }}
              ><span>{state.name}</span><span className="state-option-meta"><small>{state.stateCode}</small>{menuStatuses[state.id] && <span className={`state-menu-status state-menu-${menuStatuses[state.id]}`}><i aria-hidden="true" />{menuStatusLabel(menuStatuses[state.id])}</span>}</span></button>)}
            </div>}
          </div>
        </div>

        <div className="flags" aria-label="Current flag positions">
          <FlagDisplay result={usResult} kind="us" />
          <FlagDisplay result={stateResult} kind="state" stateName={selectedState.name} stateCode={selectedState.stateCode} />
        </div>

        <div className="status-copy">
          {explanation && <p className="status-explanation">{explanation}</p>}
          {answer.status !== "full_mast" && <p className="reason"><strong>Why?</strong> <span>{reason || "No current official order found."}</span></p>}
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
