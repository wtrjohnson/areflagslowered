"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { answerStatus } from "../lib/answer-engine.ts";
import { jurisdictionByCode, jurisdictionCatalog } from "../lib/jurisdictions.ts";
import { flagAssetPath } from "../lib/flag-assets.ts";
import { matchesStateFilter, matchesStateQuery } from "../lib/state-picker.ts";
import type { StatusAnswer, FlagResult, Jurisdiction } from "../lib/types.ts";
import type { JurisdictionMenuStatus, StateFilter } from "../lib/state-picker.ts";

const today = new Date().toISOString().slice(0, 10);
const stateFilters: Array<{ id: StateFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "full_mast", label: "Full mast" },
  { id: "half_mast", label: "Half mast" },
];
const savedStateKey = "are-flags-lowered-state";

function savedStatePreference() {
  try {
    return jurisdictionByCode(window.localStorage.getItem(savedStateKey) || "");
  } catch {
    return undefined;
  }
}

function rememberStatePreference(state: Jurisdiction) {
  try {
    window.localStorage.setItem(savedStateKey, state.stateCode || "");
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts.
  }
}

function statusLabel(status: FlagResult["status"]) {
  return status === "half_mast" ? "Half-mast" : status === "below_us" ? "Below U.S. flag" : status === "uncertain" ? "Needs review" : "Full mast";
}

function statusWord(status: StatusAnswer["status"]) {
  return status === "half_mast" ? "Yes." : status === "uncertain" ? "Not sure." : "No.";
}

function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

function dateText(order: FlagResult["orders"][number]) {
  const startDate = displayDate(order.effectiveStart);
  const start = `${startDate}${order.effectiveStartTime ? ` at ${order.effectiveStartTime}` : ""}`;
  if (!order.effectiveEnd) return `From ${start} until further notice`;
  const endDate = displayDate(order.effectiveEnd);
  const endDetail = order.effectiveEndTime ? ` at ${order.effectiveEndTime}` : order.effectiveEndCondition ? ` at ${order.effectiveEndCondition}` : "";
  const end = `${endDate}${endDetail}`;
  if (order.effectiveEnd === order.effectiveStart) {
    if (order.effectiveStartTime && order.effectiveEndTime) return `On ${startDate} from ${order.effectiveStartTime} to ${order.effectiveEndTime}`;
    if (order.effectiveEndTime || order.effectiveEndCondition) return `On ${start} until ${order.effectiveEndTime || order.effectiveEndCondition}`;
    return `On ${startDate}`;
  }
  return `From ${start} through ${end}`;
}

function fallbackAnswer(state: Jurisdiction, date: string) {
  return answerStatus({ location: state.name, stateCode: state.stateCode, date, checkedAt: `${today}T12:00:00.000Z` });
}

function fallbackNationalAnswer(date: string) {
  return answerStatus({ location: "United States", date, flagTypes: ["us"], checkedAt: `${today}T12:00:00.000Z` });
}

async function fetchStatusAnswer(state: Jurisdiction, signal: AbortSignal) {
  // The server resolves the current date and time in the selected state's
  // timezone. Sending the browser's UTC date made late-evening orders appear
  // expired in states that were still on the prior local date.
  const params = new URLSearchParams({ location: state.name, state: state.stateCode || "" });
  const response = await fetch(`/api/status?${params}`, { signal });
  if (!response.ok) throw new Error("Status unavailable");
  return response.json() as Promise<StatusAnswer>;
}

async function fetchNationalAnswer(signal: AbortSignal) {
  const params = new URLSearchParams({ location: "United States" });
  const response = await fetch(`/api/status?${params}`, { signal });
  if (!response.ok) throw new Error("Status unavailable");
  return response.json() as Promise<StatusAnswer>;
}

function menuStatusLabel(status: JurisdictionMenuStatus) {
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

export default function Home({ initialStateCode }: { initialStateCode?: string }) {
  const initialState = initialStateCode ? jurisdictionByCode(initialStateCode) : undefined;
  const [selectedState, setSelectedState] = useState<Jurisdiction | null>(initialState || null);
  const [stateOpen, setStateOpen] = useState(false);
  const [stateQuery, setStateQuery] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [focusedStateId, setFocusedStateId] = useState(initialState?.id || "");
  const [menuStatuses, setMenuStatuses] = useState<Record<string, JurisdictionMenuStatus>>({});
  const [menuStatusesLoaded, setMenuStatusesLoaded] = useState(false);
  const [answer, setAnswer] = useState<StatusAnswer>(() => initialState ? fallbackAnswer(initialState, today) : fallbackNationalAnswer(today));
  const [loading, setLoading] = useState(true);
  const [refreshingState, setRefreshingState] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackName, setFeedbackName] = useState("");
  const [feedbackEmail, setFeedbackEmail] = useState("");
  const [feedbackWebsite, setFeedbackWebsite] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [feedbackError, setFeedbackError] = useState("");
  const statePickerRef = useRef<HTMLDivElement>(null);
  const stateTriggerRef = useRef<HTMLButtonElement>(null);
  const stateSearchRef = useRef<HTMLInputElement>(null);
  const stateOptionsRef = useRef<HTMLDivElement>(null);
  const stateFilterRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const statusRequestRef = useRef(0);

  const searchedStates = useMemo(() => jurisdictionCatalog.filter((state) => matchesStateQuery(state, stateQuery)), [stateQuery]);
  const filteredStates = useMemo(
    () => searchedStates.filter((state) => matchesStateFilter(menuStatuses[state.id], stateFilter)),
    [menuStatuses, searchedStates, stateFilter],
  );
  const filterCounts = useMemo(() => ({
    all: searchedStates.length,
    full_mast: searchedStates.filter((state) => matchesStateFilter(menuStatuses[state.id], "full_mast")).length,
    half_mast: searchedStates.filter((state) => matchesStateFilter(menuStatuses[state.id], "half_mast")).length,
  }), [menuStatuses, searchedStates]);
  const activeStateId = filteredStates.some((state) => state.id === focusedStateId) ? focusedStateId : (filteredStates[0]?.id || "");

  const closePicker = (returnFocus = false) => {
    setStateOpen(false);
    setStateQuery("");
    setStateFilter("all");
    if (returnFocus) requestAnimationFrame(() => stateTriggerRef.current?.focus());
  };

  const selectState = async (state: Jurisdiction) => {
    const requestId = ++statusRequestRef.current;
    setLoading(true);
    setRefreshingState(true);
    setSelectedState(state);
    setAnswer(fallbackAnswer(state, today));
    setFocusedStateId(state.id);
    rememberStatePreference(state);
    window.history.replaceState(null, "", `/${state.slug}`);
    closePicker(true);
    try {
      const nextAnswer = await fetchStatusAnswer(state, AbortSignal.timeout(10_000));
      if (statusRequestRef.current !== requestId) return;
      setAnswer(nextAnswer);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (statusRequestRef.current !== requestId) return;
      setAnswer(fallbackAnswer(state, today));
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
    if (!feedbackOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFeedbackOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [feedbackOpen]);

  const submitFeedback = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedbackStatus("submitting");
    setFeedbackError("");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: feedbackMessage, name: feedbackName, email: feedbackEmail, website: feedbackWebsite, pagePath: window.location.pathname }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "We couldn't save your feedback right now.");
      setFeedbackStatus("sent");
      setFeedbackMessage("");
      setFeedbackName("");
      setFeedbackEmail("");
      setFeedbackWebsite("");
    } catch (error) {
      setFeedbackStatus("error");
      setFeedbackError(error instanceof Error ? error.message : "We couldn't save your feedback right now.");
    }
  };

  useEffect(() => {
    if (!stateOpen) return;
    stateSearchRef.current?.focus();
  }, [stateOpen]);

  useEffect(() => {
    if (!stateOpen || !activeStateId) return;
    const options = stateOptionsRef.current;
    const activeOption = document.getElementById(`state-option-${activeStateId}`);
    if (!options || !activeOption) return;
    const optionsRect = options.getBoundingClientRect();
    const optionRect = activeOption.getBoundingClientRect();
    if (optionRect.top < optionsRect.top) options.scrollTop -= optionsRect.top - optionRect.top;
    if (optionRect.bottom > optionsRect.bottom) options.scrollTop += optionRect.bottom - optionsRect.bottom;
  }, [activeStateId, stateOpen]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    fetch("/api/status?all=true", { signal: AbortSignal.timeout(10000) })
      .then(async (response) => {
        if (!response.ok) throw new Error("Status list unavailable");
        return response.json() as Promise<{ statuses: Array<{ jurisdiction: { id: string }; status: { flagType: string; status: JurisdictionMenuStatus } }> }>;
      })
      .then((payload) => {
        const nextStatuses: Record<string, JurisdictionMenuStatus> = {};
        for (const row of payload.statuses) {
          if (row.status.flagType === "state") nextStatuses[row.jurisdiction.id] = row.status.status;
        }
        setMenuStatuses(nextStatuses);
      })
      .catch(() => setMenuStatuses({}))
      .finally(() => setMenuStatusesLoaded(true));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++statusRequestRef.current;
    const savedState = !initialState ? savedStatePreference() : undefined;
    const stateToLoad = initialState || savedState;
    if (stateToLoad) {
      rememberStatePreference(stateToLoad);
      setSelectedState(stateToLoad);
      setFocusedStateId(stateToLoad.id);
      setAnswer(fallbackAnswer(stateToLoad, today));
      setRefreshingState(true);
      if (!initialState) window.history.replaceState(null, "", `/${stateToLoad.slug}`);
    }
    const request = stateToLoad
      ? fetchStatusAnswer(stateToLoad, controller.signal)
      : fetchNationalAnswer(controller.signal);
    request
      .then((nextAnswer) => {
        if (statusRequestRef.current === requestId) setAnswer(nextAnswer);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (statusRequestRef.current === requestId) setAnswer(stateToLoad ? fallbackAnswer(stateToLoad, today) : fallbackNationalAnswer(today));
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

  const chooseFilter = (filter: StateFilter) => {
    setStateFilter(filter);
    setFocusedStateId("");
  };

  const moveFilterFocus = (currentFilter: StateFilter, direction: number) => {
    const currentIndex = stateFilters.findIndex((filter) => filter.id === currentFilter);
    const nextIndex = (currentIndex + direction + stateFilters.length) % stateFilters.length;
    const nextFilter = stateFilters[nextIndex].id;
    if (nextFilter !== "all" && !menuStatusesLoaded) return;
    chooseFilter(nextFilter);
    requestAnimationFrame(() => stateFilterRefs.current[nextIndex]?.focus());
  };

  const usResult = answer.flagResults.find((result) => result.flagType === "us");
  const stateResult = selectedState ? answer.flagResults.find((result) => result.flagType === "state") : undefined;
  const displayStatus: StatusAnswer["status"] = selectedState
    ? answer.status
    : usResult?.status === "half_mast"
      ? "half_mast"
      : usResult?.status === "uncertain"
        ? "uncertain"
        : "full_mast";
  const leadOrder = usResult?.orders[0] || stateResult?.orders[0];
  const reason = leadOrder?.reason || (stateResult?.status === "uncertain" ? "The official source needs review before we can give a definitive answer." : stateResult?.status === "half_mast" ? stateResult.explanation : usResult?.status === "uncertain" ? "The official source needs review before we can give a definitive answer." : usResult?.explanation);
  const explanation = (() => {
    if (usResult?.status === "half_mast" && stateResult?.status === "half_mast") return "All flags to be flown at half-mast";
    if (usResult?.status === "half_mast") return "The U.S. flag is to be flown at half-mast";
    if (stateResult?.status === "half_mast" && selectedState) return `${selectedState.name}'s flag is to be flown at half-mast`;
    if (displayStatus === "uncertain") return "The current status needs review";
    return "";
  })();

  return (
    <main className={`status-page status-${displayStatus} ${refreshingState ? "is-refreshing" : ""}`}>
      <header className="masthead">
        <p className="brand">AreFlagsLowered?</p>
        <p className="brand-answer" aria-live="polite">{statusWord(displayStatus)}</p>
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
                setFocusedStateId(selectedState?.id || jurisdictionCatalog[0].id);
                setStateQuery("");
                setStateFilter("all");
                setStateOpen((open) => !open);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setFocusedStateId(selectedState?.id || jurisdictionCatalog[0].id);
                  setStateQuery("");
                  setStateFilter("all");
                  setStateOpen(true);
                }
              }}
            >
              <span>{selectedState?.name || "Choose state or territory"}</span><span className="chevron" aria-hidden="true">⌄</span>
            </button>
            {stateOpen && <div
              id="state-picker-panel"
              className="state-menu"
              role="dialog"
              aria-label="Choose a state or territory"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closePicker(true);
                }
              }}
            >
              <label className="sr-only" htmlFor="state-search">Search states and territories</label>
              <input
                ref={stateSearchRef}
                id="state-search"
                className="state-search"
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls="state-options"
                aria-activedescendant={activeStateId ? `state-option-${activeStateId}` : undefined}
                placeholder="Search states and territories"
                value={stateQuery}
                onChange={(event) => {
                  setStateQuery(event.target.value);
                  setFocusedStateId("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") { event.preventDefault(); moveActiveState(1); }
                  if (event.key === "ArrowUp") { event.preventDefault(); moveActiveState(-1); }
                  if (event.key === "Home" && filteredStates.length) { event.preventDefault(); setFocusedStateId(filteredStates[0].id); }
                  if (event.key === "End" && filteredStates.length) { event.preventDefault(); setFocusedStateId(filteredStates[filteredStates.length - 1].id); }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const activeState = filteredStates.find((state) => state.id === activeStateId);
                    if (activeState) selectState(activeState);
                  }
                }}
              />
              <div className="state-filter-tabs" role="tablist" aria-label="Filter jurisdictions by flag status">
                {stateFilters.map((filter, index) => {
                  const disabled = filter.id !== "all" && !menuStatusesLoaded;
                  return <button
                    ref={(element) => { stateFilterRefs.current[index] = element; }}
                    type="button"
                    role="tab"
                    id={`state-filter-${filter.id}`}
                    aria-controls="state-options"
                    aria-selected={stateFilter === filter.id}
                    tabIndex={stateFilter === filter.id ? 0 : -1}
                    className="state-filter-tab"
                    disabled={disabled}
                    key={filter.id}
                    onClick={() => chooseFilter(filter.id)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowRight") { event.preventDefault(); moveFilterFocus(filter.id, 1); }
                      if (event.key === "ArrowLeft") { event.preventDefault(); moveFilterFocus(filter.id, -1); }
                    }}
                  >{filter.label}<span>{menuStatusesLoaded || filter.id === "all" ? filterCounts[filter.id] : "…"}</span></button>;
                })}
              </div>
              <div ref={stateOptionsRef} id="state-options" className="state-options" role="listbox" aria-label="Matching states and territories">
                {filteredStates.length ? filteredStates.map((state) => <button
                  type="button"
                  role="option"
                  tabIndex={-1}
                  id={`state-option-${state.id}`}
                  className={`state-option ${state.id === selectedState?.id ? "selected" : ""} ${state.id === activeStateId ? "active" : ""}`}
                  aria-selected={state.id === selectedState?.id}
                  key={state.id}
                  onMouseEnter={() => setFocusedStateId(state.id)}
                  onClick={() => selectState(state)}
                ><span className="state-option-name"><span>{state.name}</span>{state.id === selectedState?.id && <span className="selected-check" aria-hidden="true">✓</span>}</span><span className="state-option-meta"><small>{state.stateCode}</small>{menuStatuses[state.id] && <span className={`state-menu-status state-menu-${menuStatuses[state.id]}`}><i aria-hidden="true" />{menuStatusLabel(menuStatuses[state.id])}</span>}</span></button>) : <p className="no-state-match" role="status" aria-live="polite">No matching state or territory</p>}
              </div>
            </div>}
          </div>
        </div>

        <div className={`flags ${selectedState ? "" : "flags-no-state"}`} aria-label="Current flag positions">
          <FlagDisplay result={usResult} kind="us" />
          {selectedState
            ? <FlagDisplay result={stateResult} kind="state" stateName={selectedState.name} stateCode={selectedState.stateCode} />
            : <article className="state-empty"><p>Choose a state or territory above to see its flag status.</p></article>}
        </div>

        <div className={`status-copy ${loading ? "is-loading" : ""}`} aria-live="polite" aria-busy={loading}>
          {loading ? <p className="status-loading">Updating flag status…</p> : <>
            {explanation && <p className="status-explanation">{explanation}</p>}
            {displayStatus !== "full_mast" && <p className="reason"><strong>Why?</strong> <span>{reason || "No current official order found."}</span></p>}
            {leadOrder && <p className="timing">{dateText(leadOrder)}</p>}
            <div className="meta-row"><span title={new Date(answer.lastCheckedAt).toLocaleString()}>{relativeTime(answer.lastCheckedAt, now)}</span></div>
          </>}
        </div>
      </section>

      <aside className="feedback-widget" aria-label="Feedback">
        {feedbackOpen && <form className="feedback-panel" onSubmit={submitFeedback}>
          <div className="feedback-panel-heading"><h2>Send feedback</h2><button type="button" className="feedback-close" aria-label="Close feedback form" onClick={() => setFeedbackOpen(false)}>×</button></div>
          {feedbackStatus === "sent" ? <div className="feedback-thanks"><p>Thanks for helping improve this.</p><button type="button" onClick={() => { setFeedbackStatus("idle"); setFeedbackOpen(false); }}>Done</button></div> : <>
            <label>Message<textarea required minLength={3} maxLength={3000} value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} placeholder="What should we know?" /></label>
            <div className="feedback-contact-fields"><label>Name <span>(optional)</span><input value={feedbackName} maxLength={120} onChange={(event) => setFeedbackName(event.target.value)} autoComplete="name" /></label><label>Email <span>(optional)</span><input type="email" value={feedbackEmail} maxLength={254} onChange={(event) => setFeedbackEmail(event.target.value)} autoComplete="email" /></label></div>
            <label className="feedback-honeypot" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={feedbackWebsite} onChange={(event) => setFeedbackWebsite(event.target.value)} /></label>
            {feedbackStatus === "error" && <p className="feedback-error" role="alert">{feedbackError}</p>}
            <button className="feedback-submit" type="submit" disabled={feedbackStatus === "submitting"}>{feedbackStatus === "submitting" ? "Sending…" : "Send feedback"}</button>
          </>}
        </form>}
        <button type="button" className="feedback-launcher" aria-label="Send feedback" aria-expanded={feedbackOpen} onClick={() => { setFeedbackOpen((open) => !open); setFeedbackStatus("idle"); setFeedbackError(""); }}>?</button>
      </aside>
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
