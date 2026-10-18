"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AdminDashboardData } from "../../lib/admin-dashboard.ts";

type Candidate = Record<string, unknown> & { alertType?: string; reason?: string; reasonSummary?: string; stateCode?: string; geographicScope?: string; flagTypes?: string[] };

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString(undefined, { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" }) + " UTC" : "—";
}

function dateRange(candidate: Candidate) {
  const start = String(candidate.effectiveStart || "unknown");
  const end = String(candidate.effectiveEnd || candidate.effectiveEndCondition || "open-ended");
  return `${start} → ${end}`;
}

export default function AdminConsole({ initialData, operatorEmail }: { initialData: AdminDashboardData; operatorEmail: string }) {
  const [data, setData] = useState(initialData);
  const [selectedId, setSelectedId] = useState(initialData.queue[0]?.id || "");
  const [note, setNote] = useState("");
  const [canonicalOrderId, setCanonicalOrderId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selected = data.queue.find((row) => row.id === selectedId) || data.queue[0];
  const candidate = (selected?.extractedJson || {}) as Candidate;

  const matches = useMemo(() => data.matchingOrders.filter((order) => {
    if (!selected) return false;
    const jurisdictionMatches = candidate.geographicScope === "nationwide"
      ? order.jurisdictionId === "us"
      : !candidate.stateCode || order.jurisdictionId === String(candidate.stateCode).toLowerCase();
    const flags = candidate.flagTypes || [];
    return jurisdictionMatches && (!flags.length || flags.every((flag) => (order.flagTypes as string[]).includes(flag)));
  }), [candidate, data.matchingOrders, selected]);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/overview", { cache: "no-store" });
    if (!response.ok) throw new Error("Dashboard refresh failed.");
    const next = await response.json() as AdminDashboardData;
    setData(next);
    setSelectedId((current) => next.queue.some((row) => row.id === current) ? current : next.queue[0]?.id || "");
  }, []);

  useEffect(() => {
    if (busy || note.trim()) return;
    const timer = window.setInterval(() => void refresh().catch((error) => setMessage(error.message)), 30_000);
    return () => window.clearInterval(timer);
  }, [busy, note, refresh]);

  async function action(actionName: "approve" | "request_revision" | "dismiss") {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: selected.id, action: actionName, note, canonicalOrderId: canonicalOrderId || undefined }),
      });
      const result = await response.json() as { error?: string; status?: string; xPost?: string };
      if (!response.ok) throw new Error(result.error || "Review action failed.");
      setMessage(`${result.status || actionName}${result.xPost ? ` · X: ${result.xPost}` : ""}`);
      setNote("");
      setCanonicalOrderId("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Review action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function retryX(id: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/x/retry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const result = await response.json() as { status?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Retry failed.");
      setMessage(`X retry: ${result.status}`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Retry failed.");
    } finally {
      setBusy(false);
    }
  }

  const requiresCanonical = candidate.alertType && candidate.alertType !== "new";
  const failures = data.xDelivery.drafts.filter((draft) => draft.publishError);

  return <main className="ops-shell">
    <header className="ops-header">
      <div><strong>ARE FLAGS LOWERED // OPERATIONS</strong><small>{operatorEmail}</small></div>
      <div className="ops-clock"><span>{when(data.generatedAt)}</span><button onClick={() => void refresh().catch((error) => setMessage(error.message))} disabled={busy}>[REFRESH]</button></div>
    </header>

    {message && <p className="ops-message" role="status">{message}</p>}

    <div className="ops-grid">
      <section className="ops-panel"><h2>INBOUND REVIEW <b className="amber">{data.queue.length}</b></h2>
        <div className="ops-list">{data.queue.length ? data.queue.map((row) => <button key={row.id} className={row.id === selected?.id ? "selected" : ""} onClick={() => { setSelectedId(row.id); setNote(""); setCanonicalOrderId(""); }}>
          <strong>{row.subject || "(no subject)"}</strong><span>{when(row.receivedAt)}</span><em className="red">{row.error || "candidate awaiting review"}</em>
        </button>) : <p className="green">QUEUE CLEAR</p>}</div>
      </section>

      <section className="ops-panel"><h2>ACTIVE ORDERS <b className="green">{data.activeOrders.length}</b></h2>
        <div className="ops-list static">{data.activeOrders.length ? data.activeOrders.map((order) => <div key={order.id}><strong>{order.jurisdiction.name}</strong><span>{order.effectiveStart} → {order.effectiveEnd || order.effectiveEndCondition || "OPEN"}</span><em className="blue">US {order.mastStatus.us || "unknown"} / STATE {order.mastStatus.state || "unknown"}</em></div>) : <p>NO ACTIVE ORDERS</p>}</div>
      </section>

      <section className="ops-panel"><h2>INBOUND HEALTH</h2>
        <dl><div><dt>LAST SUCCESS</dt><dd className={data.health.latestSuccessfulInboundAt ? "green" : "amber"}>{when(data.health.latestSuccessfulInboundAt)}</dd></div>{Object.entries(data.health.last24Hours).map(([status, count]) => <div key={status}><dt>{status.toUpperCase()}</dt><dd>{count}</dd></div>)}<div><dt>LONG-RUNNING</dt><dd className={data.health.longRunning.length ? "amber" : "green"}>{data.health.longRunning.length}</dd></div></dl>
      </section>

      <section className="ops-panel"><h2>X DELIVERY <b className={data.xDelivery.connected ? "green" : "red"}>{data.xDelivery.connected ? "CONNECTED" : "DISCONNECTED"}</b></h2>
        <div className="ops-list static">{data.xDelivery.drafts.slice(0, 8).map((draft) => <div key={draft.id}><strong>{draft.status.toUpperCase()} · {draft.orderId}</strong><span>{when(draft.lastAttemptAt || draft.createdAt)}</span>{draft.publishError && <em className="red">{draft.publishError}</em>}{draft.retryAvailable && <button className="text-button blue" onClick={() => void retryX(draft.id)} disabled={busy}>[RETRY]</button>}</div>)}</div>
        {!data.xDelivery.drafts.length && <p>NO DELIVERIES</p>} {failures.length > 0 && <p className="red">{failures.length} DELIVERY FAILURE{failures.length === 1 ? "" : "S"}</p>}
      </section>
    </div>

    <section className="ops-panel ops-review"><h2>SELECTED REVIEW</h2>
      {!selected ? <p className="green">NO UNRESOLVED EMAILS</p> : <>
        <div className="review-columns"><div><h3>ORIGINAL REASON</h3><p>{String(candidate.reason || "No extracted reason available.")}</p></div><div><h3>PROPOSED PUBLIC SUMMARY</h3><p>{String(candidate.reasonSummary || "No summary available; request revision to reprocess.")}</p></div></div>
        <div className="review-facts"><span>TYPE {String(candidate.alertType || "unknown")}</span><span>DATES {dateRange(candidate)}</span><span>SCOPE {String(candidate.geographicScope || "unknown")}</span><span>FLAGS {(candidate.flagTypes || []).join(", ") || "unknown"}</span><span>AUTHORITY {String(candidate.issuingAuthority || "unknown")}</span></div>
        <details><summary>ORIGINAL EMAIL ▸</summary><pre>{selected.normalizedEmail}</pre></details>
        {requiresCanonical && <label className="ops-field">MATCHING CANONICAL ORDER<select value={canonicalOrderId} onChange={(event) => setCanonicalOrderId(event.target.value)}><option value="">Select an active order…</option>{matches.map((order) => <option key={order.id} value={order.id}>{order.jurisdictionName} · {order.title} · {order.effectiveStart}</option>)}</select></label>}
        <label className="ops-field">OPERATOR FEEDBACK / DISMISSAL REASON<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} placeholder="Required for revision or dismissal" /></label>
        <div className="review-actions"><button className="approve" disabled={busy || Boolean(requiresCanonical && !canonicalOrderId)} onClick={() => void action("approve")}>APPROVE + PUBLISH</button><button className="revision" disabled={busy || !note.trim()} onClick={() => void action("request_revision")}>REQUEST REVISION</button><button className="dismiss" disabled={busy || !note.trim()} onClick={() => void action("dismiss")}>DISMISS</button></div>
        {selected.events.length > 0 && <details><summary>AUDIT HISTORY ▸</summary><ul className="audit-list">{selected.events.map((event) => <li key={event.id}>{when(event.createdAt)} · {event.eventType} · {event.operatorEmail || "system"}{event.note ? ` · ${event.note}` : ""}{event.error ? ` · ${event.error}` : ""}</li>)}</ul></details>}
      </>}
    </section>
    <footer><a href="/admin/test-alert">TEST ALERT TOOL →</a></footer>
  </main>;
}
