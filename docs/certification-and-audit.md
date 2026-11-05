# Certification and audit trail

Managers can certify that a rep is field ready, and every certificate action is written to a log nobody can edit.

## Turn it on

1. Apply `supabase/migrations/20261105160000_certification_audit.sql` in the Supabase SQL editor.
2. Set `CERTIFICATION_ENABLED=true` in Netlify (all contexts) and rebuild.

Until both are done the dashboard panel, the rep card, the API routes and the public check page do not exist (404).

## How it works

- **Requirements.** On the manager dashboard ("Certification & Audit Trail") the manager names the certificate and sets up to five requirements. 0 means not required; at least one must be on.
  - game sessions (all time) and game accuracy
  - AI Doctor voice sessions in the last 90 days, and the share of them won
  - average adaptation score across analysed voice sessions
- **Evidence** is read live from what the app already stores. A rep with no voice session yet has no win rate, and missing evidence counts as not met, never as zero.
- **Issuing.** The server recomputes the evidence itself; numbers from the browser are ignored. A rep who falls short can still be certified as an **exception**, but only with a written reason, and the certificate is marked as an exception everywhere.
- **Frozen record.** A certificate keeps the criteria and the evidence it was judged on. It cannot be edited. The only change possible is a one-time **withdrawal**, which needs a written reason.
- **One live certificate** per rep per certificate name (case-insensitive). After a withdrawal the same name can be issued again.
- **Reps** see their certificates on the Home screen (EN/AR).
- **Public check page** `/verify/<12-character code>`: shows the programme, the rep's name, the company, the date, and Valid or Withdrawn. Never the evidence, the exception reason or the withdrawal reason. It prints to PDF. Codes avoid 0/O/1/I/L.

## Audit trail

`audit_events` is append-only: a database trigger refuses update, delete and truncate, and the app has no write path to it. Certificate events are written by a database trigger in the same transaction as the change, so a certificate cannot be issued or withdrawn without a record. Managers read their company's trail on the dashboard.

**What it is not:** it is not cryptographically chained, so someone with full database owner access could in principle still alter it. It covers certificate events only; other manager actions (assignments, scenarios, knowledge packs) do not write to it yet.

## Checked

The migration was run against an in-memory PostgreSQL (PGlite) with stand-in `auth` and `profiles` tables: constraints, both triggers, row-level security for manager, rep, other company and outsider, and company deletion (certificates go, the audit trail stays). It has not been run on the real Supabase project.
