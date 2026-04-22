# Atto — Next.js Application

This folder contains the main Next.js application for the POC.

The canonical project documentation now lives in the repository root:

- [`../../README.md`](../../README.md)

Read the root README for:

- why this application exists
- what the proxy architecture is proving
- why Mode 2 is the primary path
- how Mode 1 differs
- credential behavior
- setup and execution
- project structure and architectural rationale

## Quick Start

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## This Folder Contains

- `app/` — UI and API routes
- `lib/agent/` — Atto session setup and model configuration
- `lib/policy/` — tool restrictions and path jail
- `tests/` — application-level tests

If you are trying to understand the full system, start at the root README and then read:

- `lib/agent/atto-session.ts`
- `app/api/portkey/v1/messages/route.ts`
- `../../castari-proxy/src/queryCastari.ts`
