# Archived project history

These files are retained for historical context only. They are superseded by
`AGENTS.md`, `README.md`, `uiux-improvements.md`, `finished-log.md`, and the
current source under `client/src` and `server/src`. Do not treat them as current
configuration or runtime authority.

## Documents

| File | Original purpose |
|---|---|
| `debug.md` | Historical Supabase connectivity and data-gap investigation. |
| `update.md` | Implementation/session log for the live data-contract transition. |
| `ux-plan.md` | Superseded UX implementation history, including auth/access-code notes. |
| `ux-audit.md` | Audit trail for UI bugs and their remediation. |
| `routing-plan.md` | Rationale for clean routes, host rewrites, `_redirects`, and `vercel.json`. |
| `ux-plan-pass2.md` | Refresh, persistence, focus management, and mobile sticky-bar work. |
| `improve-ux.md` | Older visual/mobile audit referenced by `client/redesign-check.mjs`. |
| `sep27AuditReport.md` | Security, integrity, and deployment-readiness audit. |
| `h2h-layout-plan.md` | Exploratory H2H layout options. |
| `h2h-supercup-plan.md` | H2H/Super Cup scoring rules and manual-admin plan. |

## Scripts

Historical, gameweek-specific, and one-off diagnostics/operational scripts were
moved to `server/scripts/_archive/`. They are not referenced by package scripts
or application code. Mutating scripts in that directory can write Google Sheets,
staging data, or scores; review external state before running any of them again.
