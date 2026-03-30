# UI Replacement Plan: Move to Svelte Client Rendering with Shared Data Model

## Goal

Replace the current UI implementation with a Svelte-based client-rendered application that runs on top of a shared server/client data model, while preserving existing API behavior and graph workflows.

## Current State (Baseline)

- Backend: Express + TypeScript (`/src/server.ts`, `/src/routes/api.ts`)
- Frontend: static HTML + imperative DOM JS (`/src/public/index.html`, `/src/public/app.js`)
- Delivery: server serves static assets and API routes; no dedicated frontend build pipeline today

This migration focuses on replacing the UI rendering and state orchestration layer with Svelte, while keeping APIs stable during rollout.

## Principles

1. **API-first compatibility:** existing `/api/*` endpoints remain valid through migration.
2. **Shared model contracts:** domain types and validation logic are shared between server and client.
3. **Incremental rollout:** avoid big-bang replacement; ship in phases behind feature flags.
4. **Behavior parity first, enhancements second:** preserve graph editing, selection, actions, auto-action polling, and optimistic updates before redesign.
5. **Test migration with confidence:** keep existing tests green while adding Svelte-focused tests.

## Target Architecture

### 1) Shared domain package (inside repo)

Create a shared module (e.g., `src/shared/`) for:

- Graph entities: `Graph`, `Node`, `Edge`, `HistoryState`
- Action request/response DTOs for `/api/brainstorm/execute`
- UI-relevant invariants:
  - root creation semantics
  - optimistic node lifecycle
  - dedupe/reconciliation rules
- Runtime validation helpers (schema-based where practical)

Both server routes/services and Svelte client consume these shared types/contracts.

### 2) Svelte app layer

Introduce a client app under a new frontend directory (e.g., `src/client/`) with:

- `App.svelte` root shell
- feature modules:
  - Graph canvas and node rendering
  - Action panel/config drawer
  - Graph controls (zoom/search/import/export/bookmark/history)
  - Toast/status UI
- centralized state store (Svelte stores) to replace ad-hoc mutable globals
- service layer for API calls and polling

### 3) Server responsibilities

- Keep serving API routes
- Serve compiled frontend assets in production
- Keep fallback route to frontend entrypoint

## Migration Phases

## Phase 0 — Preparation (1-2 PRs)

- Add frontend toolchain for Svelte (Vite + Svelte plugin + TS support).
- Add build scripts:
  - `build:server`
  - `build:client`
  - `build` composing both
- Keep current `src/public` app as default runtime path.
- Add feature flag (env var) to switch between legacy UI and Svelte UI entrypoint.

**Deliverable:** Svelte app bootstraps and renders placeholder shell without affecting legacy UI.

## Phase 1 — Shared model extraction (2-4 PRs)

- Extract graph DTO/type definitions into `src/shared`.
- Move transform and normalization helpers used by both server/client into shared utilities.
- Update server code to import shared types first, without behavior changes.
- Add contract tests for key API payloads/responses.

**Deliverable:** server compiles and tests pass using shared types; no UI change yet.

## Phase 2 — Data access + state foundation in Svelte (2-3 PRs)

- Build API client module in Svelte app:
  - load models/config/actions
  - load graph/list
  - execute action
- Build Svelte stores for:
  - graph snapshot/cache
  - selection state
  - UI controls (zoom/search/drawer)
  - async states/errors/toasts
- Implement polling abstraction for pending auto-actions.

**Deliverable:** Svelte app can load and display graph metadata + status summary.

## Phase 3 — Graph rendering parity (3-6 PRs)

- Implement graph canvas rendering in Svelte:
  - nodes + edges
  - zoom/pan
  - node selection and multi-select
  - detail/search highlighting
- Port existing layout and inherited-framing logic (or encapsulate in shared utility).
- Preserve root creation semantics and optimistic lifecycle parity.

**Deliverable:** interactive graph parity with legacy app for core viewing/editing.

## Phase 4 — Action workflows parity (3-5 PRs)

- Implement action panel + trigger filtering.
- Implement inline draft creation UX:
  - enter/escape behavior
  - root create-as-dblclick flow
  - pending submission lock
- Implement execution flow:
  - optimistic updates
  - reconciliation/dedupe
  - delayed reload behavior when needed

**Deliverable:** end-to-end action execution parity in Svelte.

## Phase 5 — Legacy parity verification + cutover (2-4 PRs)

- Run side-by-side smoke validation using feature flag.
- Expand tests for known regression paths (duplicate root, wrong parent edge, delayed reload).
- Switch default UI entrypoint to Svelte.
- Keep legacy UI available briefly as fallback, then remove.
- Remove all legacy UI code and styles.
- Scan the code to confirm all old UI references are removed.

**Deliverable:** Svelte UI becomes default production UI.

## Testing Strategy

1. **Contract tests** for shared DTOs and API payload/response compatibility.
2. **Component/store tests** for Svelte state transitions:
   - optimistic root lifecycle
   - reconciliation edge-cases
   - merge selection behavior
3. **Integration tests** (API + client) for:
   - create-as-root and no-parent-edge guarantees
   - delayed auto-action reload path
   - graph list and bookmark behavior
4. **Regression capture** from existing Jest tests:
   - port critical `app-root-create` cases to new Svelte test suite while retaining server tests.

## Rollout & Risk Management

- **Feature flag rollout** (legacy vs Svelte entrypoint)
- **Canary verification** in lower envs first
- **Performance checks** on large graphs (render cost, interaction latency)
- **Fallback path**: instant revert to legacy UI if severe regression appears during transition

## Implementation Backlog (Suggested)

1. Scaffold Svelte/Vite client + scripts
2. Add shared graph/action DTO module
3. Wire server to shared DTO module
4. Build Svelte API client + stores
5. Render graph shell (nodes/edges)
6. Port zoom/search/selection
7. Port action panel + execute flow
8. Port root draft + optimistic reconciliation
9. Add parity/regression tests
10. Flip default UI + remove legacy app

## Definition of Done

- Svelte client is default UI.
- Shared data model used by both server and client.
- Existing critical workflows pass:
  - graph load/search/zoom
  - action execution
  - root creation without parent edge regressions
  - delayed/auto reload reconciliation
- Legacy imperative frontend removed or archived behind non-default flag.
