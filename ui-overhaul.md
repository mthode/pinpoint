# UI Overhaul — Canvas-First Mind Map

## Problem Summary

The current layout is a vertical stack of fixed sections (header → brainstorm panel → graph panel → chat → input footer), each consuming fixed screen real estate. The canvas gets a constrained `min-height: 220px / max-height: 320px` box — roughly 20% of the viewport. The linear chat + textarea footer reinforce a chat-app mental model rather than a mind-map.

---

## Architectural Changes

### 1. Canvas goes full-screen

- The graph canvas becomes the **entire viewport** (`100vw × 100vh`), no max-height cap.
- All other UI lives as **floating overlays** on top of the canvas.
- The `.app` container switches from `flex-direction: column` (stacked sections) to a single full-bleed canvas with `position: relative`.

### 2. Top navigation bar (slim, floating)

A thin floating bar at the top with:

- **Left**: Logo + graph picker + filter + New/Bookmark
- **Right**: Provider/model selectors, zoom controls, undo/redo, search, export/import
- Collapses gracefully: secondary items behind a "..." overflow menu at narrow widths.
- Semi-transparent background so the canvas shows through.

### 3. Kill the linear chat section entirely

- Remove the `<main class="chat-container">` and `<footer class="input-area">` sections.
- No more scrolling message list or standalone textarea.
- The chat history is already captured in graph nodes — the canvas *is* the conversation.

### 4. Bubble-native input model

- **Double-click on empty canvas** → creates a new root bubble (Question or Request) with an inline text editor.
- **Click an action button on a node** → if it's a user action (e.g., "Answer Clarification"), opens an **inline text editor as a child bubble** attached to that node, rather than a `window.prompt()`.
- All user text entry happens **inside bubble cards on the canvas**, never in a detached footer.
- When the user presses Enter (or clicks a confirm button on the bubble), the action executes and generates child nodes on the graph as before.

### 5. Context/action panels become floating popups

- **Node actions popup**: click a node → a small floating panel appears nearby with: bubble type, content preview, available actions, merge/select controls. Dismisses on click-away or Escape.
- **Brainstorm config panel**: moves into a slide-out drawer (hamburger menu or gear icon in the nav bar) — agent list, trigger/action browsing, auto-actions toggle.
- **Merge preview**: appears as a floating panel when 2+ nodes are multi-selected, positioned near the selection cluster.
- **Graph metadata** (name, bookmark): inline-editable in the nav bar, not a separate section.

### 6. Node cards expand on the canvas

- Current nodes are tiny (190×74px, 1-line clamp). With the canvas being full-screen, nodes get more room.
- Expand to show 3–4 lines of content by default.
- Click to fully expand a node in place (or in a side detail panel).

---

## Implementation Phases

### Phase A — Full-bleed canvas + floating nav bar

**Goal**: Canvas fills the viewport. All chrome moves to a slim floating nav bar or is removed.

**Steps**:

1. Remove `<main class="chat-container">` and `<footer class="input-area">` from `index.html`.
2. Remove `<section class="brainstorm-panel">` from the main flow (will return as a drawer in Phase D).
3. Restructure `.app` so the graph canvas is the root surface (`width: 100vw; height: 100vh`).
4. Replace the current `<header>` and graph-panel header with a single slim floating nav bar (`position: fixed; top: 0`).
5. Move provider/model selects, graph picker/filter, zoom controls, undo/redo, search, export/import, bookmark into the nav bar.
6. Remove `max-height` cap on the canvas; let it fill the viewport.
7. Update CSS: full-bleed canvas, floating nav, remove chat/footer/brainstorm-panel styles.
8. Update `app.js`: remove `sendMessage()`, chat message rendering, and footer event listeners. Keep all graph/brainstorm logic intact.

**Files**: `index.html`, `styles.css`, `app.js`

---

### Phase B — Inline bubble editing

**Goal**: User input happens inside bubbles on the canvas, not in a separate input area.

**Steps**:

1. Double-click on empty canvas area → insert a new "draft" node at click position with an inline `<textarea>`.
2. Draft node has a bubble-type picker (dropdown: Question, Request, Context, Constraint, Assumption, Criterion).
3. Press Enter (without Shift) or click a confirm button → executes `ask_question` / equivalent action, creating the node on the graph.
4. Press Escape → cancels and removes the draft node.
5. Replace `window.prompt()` in user-action execution with an inline child-bubble editor attached to the parent node.
6. Position the draft bubble using the graph layout engine so it doesn't overlap existing nodes.

**Files**: `app.js`, `styles.css`

---

### Phase C — Floating node-action popup

**Goal**: Replace below-canvas quick-actions and merge preview with a positioned popup near the clicked node.

**Steps**:

1. On node click (single select), show a floating popup anchored to the node's position.
2. Popup contains: bubble type badge, full content (scrollable), available actions as buttons, Select/Unselect for merge.
3. On Escape or click-away → dismiss popup.
4. When 2+ nodes are multi-selected, show a floating merge panel positioned at the centroid of the selected nodes.
5. Merge panel shows: selected node previews, merge-capable actions.
6. Remove the static `#quick-actions`, `#merge-summary`, `#merge-preview` elements from `index.html`.

**Files**: `index.html`, `styles.css`, `app.js`

---

### Phase D — Slide-out config drawer

**Goal**: Brainstorm configuration (agents, actions, auto-actions toggle) lives behind a gear icon, not always visible.

**Steps**:

1. Add a gear icon button to the nav bar.
2. Clicking it opens a slide-out drawer from the right edge.
3. Drawer contains: agent summary, trigger selector, action list, auto-actions toggle, refresh button.
4. Drawer closes on Escape, click-outside, or clicking the gear icon again.
5. Remove the old `<section class="brainstorm-panel">` markup entirely (it was hidden in Phase A; now its content moves into the drawer).

**Files**: `index.html`, `styles.css`, `app.js`

---

### Phase E — Expanded node cards

**Goal**: Nodes are larger and more readable on the full-screen canvas.

**Steps**:

1. Increase default node width from 190px to 260px.
2. Increase content line clamp from 1 to 3–4 lines.
3. Remove `max-height: 108px`; let nodes size to content (with a reasonable cap around 200px).
4. On click, expand the node card in-place to show full content (or toggle a detail side-panel).
5. Update layout algorithm spacing (`horizontalGap`, `verticalGap`) to accommodate larger nodes.
6. Ensure drag, zoom, and pan still work correctly with larger node dimensions.

**Files**: `styles.css`, `app.js`

---

## What stays unchanged

- All backend endpoints, graph store, brainstorm engine, YAML config, and tests — this is purely a frontend layout restructure.
- Graph data model (nodes, edges, positions, history).
- Keyboard shortcuts (they just work on the new canvas).
