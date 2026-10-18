# Product Roadmap

This is a working list of future improvements for Are Flags Lowered. Items are
grouped loosely by the value they add rather than by a committed schedule.

## Data accuracy and resilience

- [ ] Determine a visitor's location (with permission and a manual override) so
  the state shown is accurate.
- [ ] Add direct coverage from official state websites as a second data source,
  reducing reliance on American Flags Express and building a proprietary,
  source-linked data set.
- [ ] Show the source, publication time, effective period, and last-checked
  time for every displayed status.
- [ ] Detect and surface conflicts between sources instead of silently choosing
  one result.
- [ ] Add monitoring and alerts for stale sources, failed ingestion, and
  expiring orders.

## Product and trust

- [ ] Create a logo and basic visual identity.
- [ ] Choose, register, and configure a production domain.
- [ ] Add a clear methodology, accuracy disclaimer, and a way for visitors to
  report a suspected incorrect status.
- [ ] Make location selection explicit and privacy-conscious: explain why it is
  requested, do not retain precise location by default, and support a saved
  state preference.
- [ ] Add accessible sharing and notification options, such as a daily state
  status page, email/RSS alerts, or a simple API.

## Coverage and operations

- [ ] Define coverage goals for every state, territory, and federal order, and
  make coverage gaps visible.
- [ ] Build an internal review queue for uncertain, ambiguous, or conflicting
  orders.
- [ ] Maintain historical orders and a public change log so past statuses can
  be verified.
- [ ] Add automated tests and periodic audits for each official-source adapter.

## Suggested order

1. Official-source coverage and freshness/conflict monitoring.
2. Transparent status provenance and a correction/reporting path.
3. Privacy-respecting location detection with manual selection.
4. Brand work: logo and domain.
5. Alerts, historical views, and broader public API features.
