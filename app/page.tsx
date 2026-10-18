"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { answerStatus } from "../lib/answer-engine.ts";
import { jurisdictionByCode, jurisdictionCatalog } from "../lib/jurisdictions.ts";
import { flagAssetPath } from "../lib/flag-assets.ts";
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
  const start = `${order.effectiveStart}${order.effectiveStartTime ? ` at ${order.effectiveStartTime}` : ""}`;
  if (!order.effectiveEnd) return `From ${start} until further notice`;
  const end = `${order.effectiveEnd}${order.effectiveEndTime ? ` at ${order.effectiveEndTime}` : order.effectiveEndCondition ? ` at ${order.effectiveEndCondition}` : ""}`;
  if (order.effectiveEnd === order.effectiveStart && order.effectiveStartTime && order.effectiveEndTime) return `On ${order.effectiveStart} from ${order.effectiveStartTime} to ${order.effectiveEndTime}`;
  return order.effectiveEnd === order.effectiveStart ? `On ${start} through ${end}` : `From ${start} through ${end}`;
}

function fallbackAnswer(state: Jurisdiction, date: string) {
  return answerStatus({ location: state.name, stateCode: state.stateCode, date, checkedAt: `${today}T12:00:00.000Z` });
}

async function fetchStatusAnswer(state: Jurisdiction, signal: AbortSignal) {
  const params = new URLSearchParams({ location: state.name, state: state.stateCode || "", date: today });
  const response = await fetch(`/api/status?${params}`, { signal });
  if (!response.ok) throw new Error("Status unavailable");
  return response.json() as Promise<StatusAnswer>;
}

function menuStatusLabel(status: MenuStatus) {
  return status === "half_mast" ? "Half-mast" : status === "below_us" ? "Below U.S." : status === "uncertain" ? "Review" : "Full mast";
}

function relativeTime(value: string, now: number) {
  const elapsed = Math.max(0, now - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}

export default function Home({ initialStateCode = "VA" }: { initialStateCode?: string }) {
  const initialState = jurisdictionByCode(initialStateCode) || defaultState;
  const [selectedState, setSelectedState] = useState(initialState);
  const [stateOpen, setStateOpen] = useState(false);
  const [stateQuery, setStateQuery] = useState("");
  const [focusedStateId, setFocusedStateId] = useState(initialState.id);
  const [menuStatuses, setMenuStatuses] = useState<Record<string, MenuStatus>>({});
  const [answer, setAnswer] = useState<StatusAnswer>(() => fallbackAnswer(initialState, today));
  const [loading, setLoading] = useState(true);
  const [refreshingState, setRefreshingState] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const statePickerRef = useRef<HTMLDivElement>(null);
  const stateTriggerRef = useRef<HTMLButtonElement>(null);
  const stateSearchRef = useRef<HTMLInputElement>(null);
  const statusRequestRef = useRef(0);

  const filteredStates = useMemo(() => {
    const query = stateQuery.trim().toLowerCase();
    if (!query) return jurisdictionCatalog;
    return jurisdictionCatalog.filter((state) => state.name.toLowerCase().includes(query) || state.stateCode.toLowerCase().includes(query));
  }, [stateQuery]);
  const activeStateId = filteredStates.some((state) => state.id === focusedStateId) ? focusedStateId : (filteredStates[0]?.id || "");

  const closePicker = (returnFocus = false) => {
    setStateOpen(false);
    setStateQuery("");
    if (returnFocus) requestAnimationFrame(() => stateTriggerRef.current?.focus());
  };

  const selectState = async (state: Jurisdiction) => {
    const requestId = ++statusRequestRef.current;
    setLoading(true);
    setRefreshingState(true);
    setFocusedStateId(state.id);
    closePicker(true);
    try {
      const nextAnswer = await fetchStatusAnswer(state, AbortSignal.timeout(10_000));
      if (statusRequestRef.current !== requestId) return;
      setAnswer(nextAnswer);
      setSelectedState(state);
      window.history.replaceState(null, "", `/${state.slug}`);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (statusRequestRef.current !== requestId) return;
      setAnswer(fallbackAnswer(state, today));
      setSelectedState(state);
      window.history.replaceState(null, "", `/${state.slug}`);
    } finally {
      if (statusRequestRef.current !== requestId) return;
      setLoading(false);
      setRefreshingState(false);
    }
  };

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (statePickerRef.current && !statePickerRef.current.contains(event.target as Node)) closePicker();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, []);

  useEffect(() => {
    if (!stateOpen) return;
    stateSearchRef.current?.focus();
  }, [stateOpen]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
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
    const requestId = ++statusRequestRef.current;
    fetchStatusAnswer(initialState, controller.signal)
      .then((nextAnswer) => {
        if (statusRequestRef.current === requestId) setAnswer(nextAnswer);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (statusRequestRef.current === requestId) setAnswer(fallbackAnswer(defaultState, today));
      })
      .finally(() => {
        if (statusRequestRef.current !== requestId) return;
        setLoading(false);
        setRefreshingState(false);
      });
    return () => controller.abort();
  }, [initialState]);

  const moveActiveState = (direction: number) => {
    if (!filteredStates.length) return;
    const currentIndex = Math.max(0, filteredStates.findIndex((state) => state.id === activeStateId));
    const nextIndex = (currentIndex + direction + filteredStates.length) % filteredStates.length;
    setFocusedStateId(filteredStates[nextIndex].id);
  };

  const usResult = answer.flagResults.find((result) => result.flagType === "us");
  const stateResult = answer.flagResults.find((result) => result.flagType === "state");
  const leadOrder = usResult?.orders[0] || stateResult?.orders[0];
  const reason = leadOrder?.reason || (stateResult?.status === "uncertain" ? "The official source needs review before we can give a definitive answer." : stateResult?.status === "half_mast" ? stateResult.explanation : usResult?.status === "uncertain" ? "The official source needs review before we can give a definitive answer." : usResult?.explanation);
  const explanation = (() => {
    if (usResult?.status === "half_mast" && stateResult?.status === "half_mast") return "All flags to be flown at half-mast";
    if (usResult?.status === "half_mast") return "The U.S. flag is to be flown at half-mast";
    if (stateResult?.status === "half_mast") return `${selectedState.name}'s flag is to be flown at half-mast`;
    if (answer.status === "uncertain") return "The current status needs review";
    return "";
  })();

  return (
    <main className={`status-page status-${answer.status} ${refreshingState ? "is-refreshing" : ""}`}>
      <header className="masthead">
        <p className="brand">AreFlagsLowered?</p>
        <p className="brand-answer" aria-live="polite">{statusWord(answer.status)}</p>
      </header>

      <section className="hero" aria-labelledby="status-heading">
        <h1 id="status-heading" className="sr-only">Current flag status</h1>
        <div className="location-context">
          <span>United States</span>
          <span className="location-divider" aria-hidden="true">·</span>
          <div className="state-picker" ref={statePickerRef}>
            <button
              ref={stateTriggerRef}
              type="button"
              className="state-trigger"
              aria-haspopup="dialog"
              aria-expanded={stateOpen}
              aria-controls="state-picker-panel"
              onClick={() => {
                setFocusedStateId(selectedState.id);
                setStateQuery("");
                setStateOpen((open) => !open);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setFocusedStateId(selectedState.id);
                  setStateQuery("");
                  setStateOpen(true);
                }
              }}
            >
              <span>{selectedState.name}</span><span className="chevron" aria-hidden="true">⌄</span>
            </button>
            {stateOpen && <div id="state-picker-panel" className="state-menu" role="dialog" aria-label="Choose a state">
              <label className="sr-only" htmlFor="state-search">Search states</label>
              <input
                ref={stateSearchRef}
                id="state-search"
                className="state-search"
                type="search"
                placeholder="Search states"
                value={stateQuery}
                onChange={(event) => {
                  const query = event.target.value;
                  setStateQuery(query);
                  const firstMatch = jurisdictionCatalog.find((state) => state.name.toLowerCase().includes(query.toLowerCase()) || state.stateCode.toLowerCase().includes(query.toLowerCase()));
                  setFocusedStateId(firstMatch?.id || "");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") { event.preventDefault(); closePicker(true); }
                  if (event.key === "ArrowDown") { event.preventDefault(); moveActiveState(1); }
                  if (event.key === "ArrowUp") { event.preventDefault(); moveActiveState(-1); }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const activeState = filteredStates.find((state) => state.id === activeStateId);
                    if (activeState) selectState(activeState);
                  }
                }}
              />
              <div className="state-options" role="listbox" aria-label="Matching states" aria-activedescendant={activeStateId ? `state-option-${activeStateId}` : undefined}>
                {filteredStates.length ? filteredStates.map((state) => <button
                  type="button"
                  role="option"
                  id={`state-option-${state.id}`}
                  className={`state-option ${state.id === selectedState.id ? "selected" : ""} ${state.id === activeStateId ? "active" : ""}`}
                  aria-selected={state.id === selectedState.id}
                  key={state.id}
                  onMouseEnter={() => setFocusedStateId(state.id)}
                  onClick={() => selectState(state)}
                ><span>{state.name}</span><span className="state-option-meta"><small>{state.stateCode}</small>{menuStatuses[state.id] && <span className={`state-menu-status state-menu-${menuStatuses[state.id]}`}><i aria-hidden="true" />{menuStatusLabel(menuStatuses[state.id])}</span>}</span></button>) : <p className="no-state-match">No matching state</p>}
              </div>
            </div>}
          </div>
        </div>

        <div className="flags" aria-label="Current flag positions">
          <FlagDisplay result={usResult} kind="us" />
          <FlagDisplay result={stateResult} kind="state" stateName={selectedState.name} stateCode={selectedState.stateCode} />
        </div>

        <div className={`status-copy ${loading ? "is-loading" : ""}`} aria-live="polite" aria-busy={loading}>
          {loading ? <p className="status-loading">Updating flag status…</p> : <>
            {explanation && <p className="status-explanation">{explanation}</p>}
            {answer.status !== "full_mast" && <p className="reason"><strong>Why?</strong> <span>{reason || "No current official order found."}</span></p>}
            {leadOrder && <p className="timing">{dateText(leadOrder)}</p>}
            <div className="meta-row"><span title={new Date(answer.lastCheckedAt).toLocaleString()}>{relativeTime(answer.lastCheckedAt, now)}</span></div>
          </>}
        </div>
      </section>
    </main>
  );
}

function FlagDisplay({ result, kind, stateName, stateCode }: { result?: FlagResult; kind: "us" | "state"; stateName?: string; stateCode?: string }) {
  const status = result?.status || "uncertain";
  const flagSrc = flagAssetPath(kind, stateCode);
  return (
    <article className={`flag-display flag-${kind} flag-${status} ${stateCode ? `flag-state-${stateCode}` : ""}`}>
      <div className="flag-stage" aria-hidden="true">
        <div className="flag-pole" />
        <div className="flag-cloth">
          <span /><span /><span /><span /><span />
          {flagSrc && <img className="flag-art" src={flagSrc} alt="" onError={(event) => {
            event.currentTarget.hidden = true;
            event.currentTarget.closest(".flag-cloth")?.setAttribute("data-asset-missing", "true");
            if (import.meta.env.DEV) console.warn(`Flag artwork failed to load: ${flagSrc}`);
          }} />}
        </div>
      </div>
      <p className="flag-name">{kind === "us" ? "U.S. flag" : `${stateName} flag`}</p>
      <p className="flag-status">{statusLabel(status)}</p>
    </article>
  );
}
