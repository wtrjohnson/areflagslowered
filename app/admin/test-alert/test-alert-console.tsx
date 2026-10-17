"use client";

import { useState } from "react";
import { jurisdictionCatalog } from "../../../lib/jurisdictions.ts";
import type { PreviewStatus } from "../../../lib/share-preview-core.ts";

type Result = {
  jurisdiction: { name: string; stateCode: string; flagAsset: string };
  usStatus: PreviewStatus;
  stateStatus: PreviewStatus;
  socialText: string;
  simulatedShareUrl: string;
  previewAlt: string;
  extraction?: { namedEntities: string[]; issuingAuthority: string; geographicScope: string; reason: string };
  notes: string[];
};

const today = new Date().toISOString().slice(0, 10);

function Flag({ src, label, status }: { src: string; label: string; status: PreviewStatus }) {
  return <div className="test-flag-group" aria-label={`${label} ${status.replace("_", " ")}`}>
    <i className="test-pole" />
    <img className={`test-flag-art test-flag-${status}`} src={src} alt="" />
  </div>;
}

export default function TestAlertConsole() {
  const [mode, setMode] = useState<"scenario" | "email">("scenario");
  const [stateCode, setStateCode] = useState("NJ");
  const [reason, setReason] = useState("In memory of a public servant.");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState("");
  const [alertType, setAlertType] = useState<"new" | "correction">("new");
  const [usStatus, setUsStatus] = useState<PreviewStatus>("full_mast");
  const [stateStatus, setStateStatus] = useState<PreviewStatus>("half_mast");
  const [rawEmail, setRawEmail] = useState("");
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishResult, setPublishResult] = useState("");
  const [requestId] = useState(() => crypto.randomUUID().replace(/-/g, ""));

  const scenario = { stateCode, reason, effectiveStart: start, effectiveEnd: end || undefined, alertType, usStatus, stateStatus };

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true); setError(""); setResult(undefined);
    const payload = mode === "email"
      ? { mode, rawEmail }
      : { mode, scenario };
    try {
      const response = await fetch("/api/admin/test-alert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json() as Result & { error?: string };
      if (!response.ok) throw new Error(data.error || "Test alert could not be simulated.");
      setResult(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Test alert could not be simulated.");
    } finally { setBusy(false); }
  };

  const publish = async () => {
    setPublishBusy(true); setError(""); setPublishResult("");
    try {
      const response = await fetch("/api/admin/test-alert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "publish_test", scenario, requestId }) });
      const data = await response.json() as { status?: string; postId?: string; error?: string };
      if (!response.ok || data.status === "failed") throw new Error(data.error || "The X test post could not be published.");
      setPublishResult(data.status === "posted" ? `Test post published to X (post ID ${data.postId}).` : "This test request was already handled; no duplicate was created.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The X test post could not be published."); }
    finally { setPublishBusy(false); }
  };

  return <main className="test-console">
    <header className="test-console-header"><p className="brand">AreFlagsLowered?</p><p>Test alert console</p></header>
    <section className="test-intro"><h1>Test without publishing</h1><p>Simulate an alert, inspect the X copy and flag card, then adjust it. This page never writes an order or posts to X.</p></section>
    <form className="test-form" onSubmit={run}>
      <fieldset><legend>Input</legend>
        <div className="test-mode"><button type="button" className={mode === "scenario" ? "selected" : ""} onClick={() => setMode("scenario")}>Compose scenario</button><button type="button" className={mode === "email" ? "selected" : ""} onClick={() => setMode("email")}>Paste email</button></div>
        {mode === "scenario" ? <div className="test-fields">
          <label>Jurisdiction<select value={stateCode} onChange={(event) => setStateCode(event.target.value)}>{jurisdictionCatalog.map((item) => <option key={item.id} value={item.stateCode}>{item.name}</option>)}</select></label>
          <label>Alert type<select value={alertType} onChange={(event) => setAlertType(event.target.value as "new" | "correction")}><option value="new">New order</option><option value="correction">Correction</option></select></label>
          <label>Start date<input type="date" value={start} onChange={(event) => setStart(event.target.value)} required /></label>
          <label>End date <small>optional</small><input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
          <label>U.S. flag<select value={usStatus} onChange={(event) => setUsStatus(event.target.value as PreviewStatus)}><option value="full_mast">Full mast</option><option value="half_mast">Half mast</option><option value="uncertain">Uncertain</option></select></label>
          <label>State flag<select value={stateStatus} onChange={(event) => setStateStatus(event.target.value as PreviewStatus)}><option value="half_mast">Half mast</option><option value="full_mast">Full mast</option><option value="below_us">Below U.S.</option><option value="uncertain">Uncertain</option></select></label>
          <label className="test-wide">Reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={4} required /></label>
        </div> : <label className="test-wide">Raw American Flags Express email<textarea value={rawEmail} onChange={(event) => setRawEmail(event.target.value)} rows={14} placeholder="Paste the complete forwarded email here." required /></label>}
      </fieldset>
      <button className="test-run" disabled={busy}>{busy ? "Simulating…" : "Run dry simulation"}</button>
    </form>
    {error && <p className="test-error" role="alert">{error}</p>}
    {result && <section className="test-result" aria-live="polite"><div><h2>Flag-card preview</h2><p className="test-result-note">{result.previewAlt}</p></div><div className="test-preview"><Flag src="/flags/us.svg" label="U.S. flag" status={result.usStatus} /><Flag src={result.jurisdiction.flagAsset} label={`${result.jurisdiction.name} flag`} status={result.stateStatus} /></div><div className="test-output"><h2>X copy</h2><pre>{result.socialText}</pre><p><strong>Simulated share URL:</strong> {result.simulatedShareUrl}</p><p className="test-result-note">The simulated token is never saved. A real post gets a different, immutable token when it is published.</p>{result.extraction && <details><summary>Parsed email details</summary><p><strong>Scope:</strong> {result.extraction.geographicScope}<br /><strong>Authority:</strong> {result.extraction.issuingAuthority}<br /><strong>Names:</strong> {result.extraction.namedEntities.join(", ") || "None"}</p></details>}</div><div className="test-publish"><h2>Protected X test</h2><p>This creates one clearly labeled <strong>TEST</strong> post on @areflagslowered with a real immutable link preview. It does not affect live flag status.</p><button type="button" onClick={publish} disabled={publishBusy}>{publishBusy ? "Publishing test…" : "Post protected X test"}</button>{publishResult && <p className="test-success">{publishResult}</p>}</div><ul>{result.notes.map((note) => <li key={note}>{note}</li>)}</ul></section>}
  </main>;
}
