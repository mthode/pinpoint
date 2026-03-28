# Pinpoint — Design & Feature Roadmap

## Vision

Most AI chat tools produce a single linear thread — one question, one answer, done. Real thinking doesn't work that way. Ideas need to be explored from multiple angles, broken into parts, and refined through iteration before they converge on the right result.

**Pinpoint** is a brainstorming tool that helps you *pinpoint* exactly the result you're looking for. Instead of a flat chat log, every interaction lives on a **mind-map style canvas** where the AI's clarifying questions, step-by-step breakdowns, and your replies are all individual bubbles connected in a branching graph. When the AI asks a clarifying question you don't have to commit to a single answer — you can **branch** the conversation and explore multiple possibilities in parallel, then compare the outcomes side-by-side.

The goal is iterative convergence: start broad, branch freely, and progressively narrow until the final result matches your vision.

## Core Concepts

### Theoretical Foundations

Brainstorming isn't just "thinking hard" — it's a structured cognitive process that's been studied extensively across psychology, philosophy, and design. Pinpoint's design draws from several traditions to make the tool's structure match how minds actually work.

#### Divergent & Convergent Thinking (Guilford, 1967)

All creative problem-solving alternates between two modes:

- **Divergent** — generate many possibilities without judging them.
- **Convergent** — evaluate, filter, and narrow to the best option.

Most AI chat tools collapse both into a single turn: ask → answer. Pinpoint separates them spatially. Branching is the divergent act; comparing, pruning, and merging are the convergent acts. The canvas makes the current mode visible — a wide graph means you're still exploring; a narrow one means you're converging.

#### The Double Diamond (British Design Council)

A well-known design model with four phases arranged in two diamonds:

```
  Discover ──▶ Define ──▶ Develop ──▶ Deliver
     ◇ diverge    ◇ converge   ◇ diverge    ◇ converge
```

The first diamond is about finding the *right problem*; the second is about finding the *right solution*. Pinpoint's bubble graph naturally supports both diamonds — early clarifications and constraints define the problem; later steps and branches develop the solution.

#### Dialectical Thinking (Hegel)

Every idea (thesis) invites a counter-idea (antithesis), and the resolution of the tension produces something new (synthesis). This maps directly to Pinpoint's branch-and-merge workflow:

```
[Thesis: "Use a relational DB"]
[Antithesis: "Use a document store"]
    └── [Synthesis: "Use a relational DB with a JSON column"]
```

The tool should make it easy to place two ideas in opposition and then synthesize them — not just pick a winner.

#### The Socratic Method

Systematic questioning that uncovers hidden assumptions, exposes contradictions, and forces clarity. The AI's clarifying questions serve this role. But the Socratic method isn't just about answering questions — it's about *following the question wherever it leads*, which means the questioner shouldn't be forced into a single path. Branching preserves the Socratic spirit.

#### Lateral Thinking (De Bono)

Sometimes progress requires moving *sideways*, not forward. De Bono's provocations ("What if gravity didn't exist?") deliberately break the frame to reveal new possibilities. This suggests a bubble type that isn't an answer or a step, but a *deliberate disruption* — a what-if that rewrites the rules.

#### Six Thinking Hats (De Bono)

Different cognitive lenses that can be applied to any idea:

| Hat | Lens | Maps to... |
|-----|------|------------|
| White | Facts and data | **Context** bubble |
| Red | Feelings and intuition | **Reaction** (gut-check) |
| Black | Caution and risks | **Critique** bubble |
| Yellow | Optimism and benefits | **Evaluation / Criterion** |
| Green | Creativity and alternatives | **Provocation** / branching |
| Blue | Process and meta-thinking | **Step** / the graph structure itself |

Not every hat needs its own bubble type, but the framework reminds us that *evaluative* thinking (black/yellow) is distinct from *generative* thinking (green) and both are distinct from *informational* thinking (white).

#### Externalized Cognition & Cognitive Load

Working memory holds roughly 4±1 chunks at a time (Cowan, 2001). A complex brainstorm easily exceeds that. The canvas acts as an **external cognitive workspace** — each bubble offloads one chunk so the user can focus on *relationships between ideas* rather than struggling to remember what the ideas were. This is the same principle behind concept maps (Novak & Cañas), whiteboards, and sticky-note exercises.

#### Wallas's Four Stages of Creativity (1926)

1. **Preparation** — gather information, define the problem.
2. **Incubation** — step away; let the subconscious work.
3. **Illumination** — the "aha" moment.
4. **Verification** — test and refine the insight.

Pinpoint directly supports Preparation (context/constraint bubbles, clarifications), Illumination (branching to explore flashes of insight), and Verification (comparison, critique). Incubation is harder — but persisting the graph means a user can walk away and return with fresh eyes, picking up exactly where the branching left off.

#### Assumption Surfacing (Mason & Mitroff)

Many problems are intractable not because the solution is hard, but because a hidden assumption constrains the solution space invisibly. Making assumptions *explicit and challengeable* is one of the most powerful things a brainstorming tool can do. If an assumption is wrong, every branch built on top of it is suspect — the graph makes that dependency visible.

---

### Bubble Taxonomy

Drawing from the above, every bubble on the canvas plays one of six **cognitive roles**:

| Role | Purpose | Bubble Types |
|------|---------|-------------|
| **Initiating** | Pose the problem | Question, Request |
| **Probing** | Deepen understanding | Clarification, Provocation |
| **Framing** | Shape the problem space | Assumption, Constraint, Context, Criterion |
| **Generating** | Produce possibilities | Step, Response, Example |
| **Evaluating** | Judge quality and fit | Critique, Comparison |
| **Synthesizing** | Combine and refine | Synthesis |

#### Initiating Bubbles

| Bubble | Initiated By | Description |
|--------|-------------|-------------|
| **Question** | User | An open-ended inquiry. Divergent intent — "explore this space." Root node on the canvas. |
| **Request** | User | A directed instruction. Convergent intent — "produce this specific thing." Also a root node, but signals the AI should aim for a direct result rather than broad exploration. |

The distinction matters because the AI should respond differently: a Question invites clarifications, branches, and multi-step exploration; a Request invites a focused breakdown and a concrete deliverable.

#### Probing Bubbles

| Bubble | Initiated By | Description |
|--------|-------------|-------------|
| **Clarification** | AI | A Socratic follow-up that pauses the chain until the user responds. The primary branching trigger — the user can answer once (linear) or answer multiple ways (branch). |
| **Provocation** | User or AI | A deliberate lateral disruption: "What if we removed the login entirely?" "What if cost didn't matter?" Reframes the problem by suspending a constraint or introducing an absurd premise. Always spawns a new branch. |

Provocations are distinct from clarifications because they aren't asking for missing information — they're challenging the *frame* of the problem itself.

#### Framing Bubbles

These bubbles don't advance the conversation directly — they **shape the space** in which all downstream bubbles operate. Any bubble downstream of a framing bubble inherits its influence.

| Bubble | Initiated By | Description |
|--------|-------------|-------------|
| **Assumption** | User or AI | Something taken as given. "We're building for English-speaking users." Assumptions can be **challenged** — challenging one creates a branch where the assumption is inverted or relaxed. |
| **Constraint** | User or AI | A hard boundary. "Budget under $5k." "Must work offline." "Ships by Q3." Constraints can be toggled on/off to see how the solution space changes. |
| **Context** | User or AI | Background information the AI should consider. "The team already uses React." "This is for a regulated industry." Inherited by all descendants — every sub-bubble "knows" the context. |
| **Criterion** | User or AI | A standard for evaluating outcomes. "Prioritize accessibility." "Minimize latency over everything." Used during the convergent/evaluation phase to rank branches or compare responses. |

The power of making these explicit: the graph shows *why* a particular branch went in a particular direction. If you change a constraint, you can see which branches are affected and need to be re-explored.

#### Generating Bubbles

| Bubble | Initiated By | Description |
|--------|-------------|-------------|
| **Step** | AI | One discrete piece of a multi-step breakdown. Steps form chains; any step can be a branch point. |
| **Response** | AI | A synthesized output — the AI's answer, artifact, or deliverable for a given path. Can be intermediate (inviting further refinement) or final. |
| **Example** | AI or User | A concrete instance that illustrates an abstract idea. "For instance, Slack does this by..." Examples ground abstract discussion and often reveal hidden constraints or criteria. |

#### Evaluating Bubbles

| Bubble | Initiated By | Description |
|--------|-------------|-------------|
| **Critique** | AI or User | Identifies risks, flaws, or gaps in a sibling or ancestor bubble. "This approach fails under high concurrency." Critiques reference specific Criteria when available. |
| **Comparison** | AI | A structured side-by-side evaluation of two or more sibling branches, scored against the active Criteria. Helps drive convergence by making trade-offs visible. |

#### Synthesizing Bubbles

| Bubble | Initiated By | Description |
|--------|-------------|-------------|
| **Synthesis** | User or AI | The Hegelian merge. Draws from two or more branches to produce a new unified idea that resolves the tensions between them. A Synthesis bubble has multiple parents (the branches it draws from) — making it a true graph node, not just a tree node. |

---

### How the Types Work Together

A realistic session might look like this:

```
[Question: "Design a notification system"]
 ├── [Context: "Mobile app, 50k daily active users"]
 ├── [Constraint: "No third-party push services"]
 ├── [Criterion: "Battery efficiency is paramount"]
 │
 ├── [Clarification: "Real-time or batched?"]
 │    ├── [Answer: "Real-time"] ── [Step 1a] ── [Step 2a] ── [Response A]
 │    └── [Answer: "Batched"]   ── [Step 1b] ── [Step 2b] ── [Response B]
 │
 ├── [Provocation: "What if notifications were pull-only?"]
 │    └── [Step 1c] ── [Response C]
 │
 ├── [Comparison: A vs B vs C against "battery efficiency"]
 │
 └── [Synthesis: "Pull-based with a lightweight heartbeat for urgent items"]
      └── [Critique: "Heartbeat interval is a new constraint — how frequent?"]
           └── ...continues...
```

Notice how:
- **Framing bubbles** (Context, Constraint, Criterion) attach to the question and influence everything below them.
- **Probing bubbles** (Clarification, Provocation) create branch points.
- **Generating bubbles** (Step, Response) fill out each branch.
- **Evaluating bubbles** (Critique, Comparison) drive convergence.
- **Synthesizing bubbles** (Synthesis) merge the best of multiple branches and often restart the cycle at a deeper level.

This is the iterative convergence loop: **frame → probe → generate → evaluate → synthesize → repeat** until pinpointed.

## Agent Architecture

The brainstorming process isn't served well by a single AI voice. Different cognitive roles call for different *perspectives* — a critic thinks differently than a facilitator, who thinks differently than a devil's advocate. Pinpoint uses **multiple AI agents**, each with a distinct persona and system prompt, to drive different parts of the conversation graph.

### Agents & Personas

An **agent** is a configured AI personality with:

- **Persona** — a name, role description, and behavioral instructions baked into its system prompt.
- **Scope** — which bubble types and actions the agent is responsible for.
- **Provider binding** — which AI provider/model backs the agent (can differ per agent).

Example personas:

| Agent | Role | Cognitive Mode |
|-------|------|---------------|
| **Facilitator** | Guides the process, asks clarifying questions, breaks problems into steps. The "blue hat." | Structuring |
| **Explorer** | Generates alternatives, suggests "what if" provocations, produces divergent options. The "green hat." | Divergent |
| **Critic** | Identifies risks, surfaces assumptions, challenges weak reasoning. The "black hat." | Evaluative |
| **Synthesizer** | Finds common ground between branches, proposes merges, reconciles contradictions. | Convergent |
| **Researcher** | Adds context, provides examples, grounds abstract ideas in facts. The "white hat." | Informational |

Not all agents need to be active for every session — the user can enable/disable agents or adjust their aggressiveness. The system should also support **custom agents** defined entirely through configuration.

### Bubble Actions — The Extension Model

When a bubble exists on the canvas, it can be **extended** — meaning new child bubbles can be generated from it. The set of possible extensions depends on the bubble's type and the current state of the graph. We call each possible extension an **action**.

An **action** defines:

1. **Trigger** — which bubble type(s) can this action be invoked from?
2. **Input** — what does the action need? (user text, the parent bubble's content, ancestor context/constraints, sibling branches)
3. **Actor** — who performs the action? (`user` for manual input, or an agent name for AI-driven generation)
4. **System prompt** — for AI-driven actions, the instructions sent to the agent. This is where the persona and behavioral directives live.
5. **Output** — what bubble type(s) does the action produce?
6. **Branching behavior** — does the action produce a single child (linear), multiple parallel children (branch), or ask the user to choose?

This model means the entire brainstorming workflow is **declarative and configurable**. The source code implements a generic engine that reads action definitions and executes them — the *behavior* of the brainstorming process lives in configuration, not in code.

### Declarative Configuration (YAML)

Actions are defined in a YAML file (e.g., `bubble-actions.yaml`) that the engine loads at startup. This separation gives several advantages:

- **Iterate on behavior without rebuilding** — tune prompts, add new actions, adjust agent personas by editing YAML.
- **Share and version action sets** — different brainstorming styles (e.g., "design thinking", "technical architecture", "creative writing") can be different YAML files.
- **User customization** — power users can modify or extend the default action set.

#### Configuration Structure

```yaml
# bubble-actions.yaml

agents:
  facilitator:
    description: "Guides the brainstorming process"
    default_model: "ollama-network/llama3"
    system_prompt: |
      You are a skilled facilitator guiding a brainstorming session.
      Your job is to help the user clarify their thinking, not to answer
      for them. Ask targeted questions. Break complex problems into
      manageable pieces. Never assume — always probe.

  explorer:
    description: "Generates creative alternatives"
    default_model: "ollama-network/llama3"
    system_prompt: |
      You are a creative thinker who generates unconventional alternatives.
      When presented with an idea, produce multiple distinct approaches.
      Challenge conventional thinking. Suggest "what if" scenarios.
      Quantity over quality at this stage — wild ideas welcome.

  critic:
    description: "Identifies risks and weaknesses"
    default_model: "ollama-network/llama3"
    system_prompt: |
      You are a critical analyst. Your job is to find flaws, risks, and
      hidden assumptions in ideas. Be specific — cite which part of the
      idea is weak and why. Reference any stated criteria or constraints.
      Be constructive: identify the problem, then suggest what would fix it.

  synthesizer:
    description: "Merges insights from multiple branches"
    default_model: "ollama-network/llama3"
    system_prompt: |
      You are a synthesizer who finds unity in opposing ideas. Given two
      or more branches of thought, identify the core strengths of each
      and propose a unified approach that preserves those strengths while
      resolving contradictions. Explain what you kept and what you let go.

  researcher:
    description: "Provides factual context and examples"
    default_model: "ollama-network/llama3"
    system_prompt: |
      You are a research assistant. Provide relevant factual context,
      real-world examples, and prior art. Ground abstract discussions
      in concrete data. Cite specifics when possible. Flag when you
      are uncertain about a fact.

actions:

  # ── Initiating ──────────────────────────────────────────────

  - name: ask_question
    description: "User poses a new question"
    trigger: [root]           # can be invoked from the canvas root
    actor: user
    output: question

  - name: make_request
    description: "User makes a directed request"
    trigger: [root]
    actor: user
    output: request

  # ── Probing ─────────────────────────────────────────────────

  - name: clarify
    description: "Facilitator asks a clarifying question"
    trigger: [question, request, answer, step]
    actor: facilitator
    prompt_template: |
      The user said: "{{parent.content}}"

      Context inherited from ancestors:
      {{ancestors.context}}

      Active constraints:
      {{ancestors.constraints}}

      Ask ONE focused clarifying question to narrow scope or resolve
      ambiguity. Suggest 2-3 possible answers the user might give.
    output: clarification
    branching: pause          # waits for user answer before continuing

  - name: answer_clarification
    description: "User answers a clarifying question"
    trigger: [clarification]
    actor: user
    output: answer

  - name: provoke
    description: "Explorer challenges the frame with a what-if"
    trigger: [question, request, step, response]
    actor: explorer
    prompt_template: |
      The current line of thinking is: "{{parent.content}}"

      Active assumptions:
      {{ancestors.assumptions}}

      Generate a provocative "what if" that challenges a fundamental
      assumption or introduces a surprising constraint. Explain briefly
      why this reframe might reveal something useful.
    output: provocation
    branching: fork           # always creates a new branch

  # ── Framing ─────────────────────────────────────────────────

  - name: add_context
    description: "User or AI adds background information"
    trigger: [question, request, step]
    actor: user               # can also be triggered by researcher
    output: context

  - name: research_context
    description: "Researcher provides factual background"
    trigger: [question, request, step]
    actor: researcher
    prompt_template: |
      The topic is: "{{parent.content}}"

      Provide relevant background information, prior art, or real-world
      examples that would help someone reason about this topic.
      Be specific and factual.
    output: context

  - name: add_constraint
    description: "User adds a hard boundary"
    trigger: [question, request]
    actor: user
    output: constraint

  - name: state_assumption
    description: "Make an implicit assumption explicit"
    trigger: [question, request, step, response]
    actor: facilitator
    prompt_template: |
      Review the conversation so far:
      {{branch.summary}}

      Identify ONE important assumption that hasn't been stated
      explicitly. State it clearly and explain why it matters.
    output: assumption

  - name: challenge_assumption
    description: "Create a branch where an assumption is inverted"
    trigger: [assumption]
    actor: explorer
    prompt_template: |
      The assumption is: "{{parent.content}}"

      What would change if this assumption were false? Describe the
      alternative premise and what it would mean for the solution space.
    output: provocation
    branching: fork

  - name: add_criterion
    description: "User defines an evaluation standard"
    trigger: [question, request]
    actor: user
    output: criterion

  # ── Generating ──────────────────────────────────────────────

  - name: break_down
    description: "Facilitator decomposes into steps"
    trigger: [question, request, answer]
    actor: facilitator
    prompt_template: |
      The user wants: "{{parent.content}}"

      Context: {{ancestors.context}}
      Constraints: {{ancestors.constraints}}

      Break this into 3-7 discrete, actionable steps. Return each step
      as a separate item. Do not solve the steps — just identify them.
    output: step
    output_mode: chain        # produces a sequential chain of steps

  - name: generate_alternatives
    description: "Explorer produces multiple parallel approaches"
    trigger: [step, question, request]
    actor: explorer
    prompt_template: |
      The challenge is: "{{parent.content}}"

      Generate 2-4 meaningfully different approaches to this.
      Each approach should be a distinct strategy, not a variation.
      Label each clearly.
    output: step
    branching: fork_multiple  # produces parallel branches

  - name: respond
    description: "Produce a concrete response for this path"
    trigger: [step, answer, question, request]
    actor: facilitator
    prompt_template: |
      Based on the full path of reasoning:
      {{branch.path}}

      Context: {{ancestors.context}}
      Constraints: {{ancestors.constraints}}

      Produce a complete, concrete response that addresses the
      original question/request through the lens of this branch.
    output: response

  - name: give_example
    description: "Researcher provides a concrete example"
    trigger: [step, response, context]
    actor: researcher
    prompt_template: |
      The idea is: "{{parent.content}}"

      Provide a specific, real-world example that illustrates this
      concept. Explain how the example relates to the current discussion.
    output: example

  # ── Evaluating ──────────────────────────────────────────────

  - name: critique
    description: "Critic identifies weaknesses"
    trigger: [response, step, synthesis]
    actor: critic
    prompt_template: |
      Evaluate this: "{{parent.content}}"

      Active criteria:
      {{ancestors.criteria}}

      Identify specific weaknesses, risks, or gaps. Reference the
      stated criteria where applicable. For each issue, briefly
      suggest what would address it.
    output: critique

  - name: compare_branches
    description: "Compare sibling branches against criteria"
    trigger: [response]
    input: siblings            # reads all sibling response bubbles
    actor: synthesizer
    prompt_template: |
      Compare these approaches:
      {{siblings.content}}

      Evaluation criteria:
      {{ancestors.criteria}}

      Score each approach against each criterion. Identify clear
      winners, trade-offs, and what each approach sacrifices.
    output: comparison

  # ── Synthesizing ────────────────────────────────────────────

  - name: synthesize
    description: "Merge the best of multiple branches"
    trigger: [comparison, response]
    input: selected_branches   # user selects which branches to merge
    actor: synthesizer
    prompt_template: |
      These branches were selected for synthesis:
      {{selected.content}}

      The comparison found:
      {{comparison.content}}

      Produce a unified approach that preserves the core strengths
      of each branch. Explain what you kept, what you discarded,
      and how you resolved contradictions.
    output: synthesis
    branching: merge           # multi-parent node
```

#### Template Variables

Prompt templates use `{{variable}}` placeholders that the engine resolves at runtime by walking the graph:

| Variable | Resolves to |
|----------|-------------|
| `{{parent.content}}` | The text content of the bubble this action is extending from. |
| `{{ancestors.context}}` | Concatenated content of all Context bubbles in the ancestor chain. |
| `{{ancestors.constraints}}` | All active (non-toggled-off) Constraint bubbles in the ancestor chain. |
| `{{ancestors.assumptions}}` | All Assumption bubbles in the ancestor chain. |
| `{{ancestors.criteria}}` | All Criterion bubbles in the ancestor chain. |
| `{{branch.path}}` | The full chain of bubble contents from root to the current bubble. |
| `{{branch.summary}}` | An AI-generated summary of the branch (computed lazily and cached). |
| `{{siblings.content}}` | Content of all sibling bubbles of the same type. |
| `{{selected.content}}` | Content of bubbles the user has explicitly selected (for merge operations). |
| `{{comparison.content}}` | Content of the most recent Comparison bubble in scope. |

#### Branching Modes

| Mode | Behavior |
|------|----------|
| `pause` | Produces the output bubble and waits for user input before continuing. |
| `linear` | Produces a single child. Default if not specified. |
| `fork` | Creates one new branch alongside existing children. |
| `fork_multiple` | Creates N parallel branches (one per alternative the AI generates). |
| `merge` | Creates a bubble with edges from multiple parents (DAG node). |

#### Action Availability & the Action Menu

When the user selects a bubble on the canvas, Pinpoint computes which actions are valid for that bubble type (by matching `trigger`) and presents them in a context menu. Actions driven by `user` open a text input; actions driven by an agent execute immediately (or after confirmation, depending on settings).

The engine can also **auto-suggest** actions. For example, after a Question bubble is created, the engine might automatically fire the `clarify` and `state_assumption` actions to give the user something to react to, rather than waiting passively. Auto-fire rules are configurable:

```yaml
auto_actions:
  question:
    - clarify
    - state_assumption
    - research_context
  request:
    - break_down
  answer:
    - break_down
  step:
    - critique
```

### Execution Engine

The engine is the runtime that connects the declarative config to the AI providers:

1. **Action Resolution** — given a bubble, look up all valid actions from the YAML config.
2. **Template Rendering** — walk the graph to resolve `{{variables}}` and assemble the full prompt.
3. **Context Assembly** — build the system prompt (agent persona) + user prompt (rendered template) + inherited framing (context, constraints, assumptions, criteria from ancestors).
4. **Provider Dispatch** — send the assembled prompt to the agent's configured AI provider/model.
5. **Output Parsing** — parse the AI response into one or more new bubbles. For `chain` output, split into sequential Steps. For `fork_multiple`, split into parallel branches.
6. **Graph Update** — insert new bubbles into the graph, draw edges, and trigger auto-layout.

The engine itself is provider-agnostic and bubble-type-agnostic — all behavior comes from the YAML config. Adding a new bubble type or a new brainstorming strategy means editing the config, not the engine.

## Canvas Interaction

- Pan and zoom across the mind map.
- Click a bubble to expand/collapse its children.
- Drag bubbles to rearrange the layout manually; auto-layout available as a fallback.
- Select a bubble to view its full content in a detail panel.
- Right-click any bubble to **Branch**, **Critique**, or **Provoke** from it.
- Side-by-side comparison view for sibling branches.
- Framing bubbles (Context, Constraint, Criterion, Assumption) attach visually to their scope — shown as colored tags or pinned annotations along the edge of the affected subtree.
- Toggle a Constraint on/off to immediately see which downstream branches are invalidated.
- Synthesis bubbles can draw edges from multiple parents, making the graph a true DAG (not strictly a tree).

## Feature Roadmap

### Phase 1 — Core Canvas

- [ ] Render bubbles on an HTML canvas / SVG layer.
- [ ] Draw directional links (edges) between parent and child bubbles.
- [ ] Pan & zoom controls.
- [ ] Auto-layout algorithm (tree / force-directed).
- [ ] Bubble type visual differentiation (color, icon, shape by cognitive role).

### Phase 2 — Conversation Flow

- [ ] Create a new Question or Request bubble from the canvas (text input).
- [ ] Route to the selected AI provider and model.
- [ ] Display AI Response as a linked child bubble.
- [ ] Support AI-initiated Clarification bubbles with inline reply (Answer bubbles).
- [ ] Support multi-step breakdowns — AI returns a chain of Step bubbles.
- [ ] Support AI-generated Example bubbles to ground abstract ideas.

### Phase 3 — Agent Architecture & Declarative Actions

- [ ] YAML config loader — parse `bubble-actions.yaml` at startup.
- [ ] Agent registry — instantiate agents with persona system prompts.
- [ ] Action resolution — given a bubble type, compute valid actions from config.
- [ ] Template rendering engine — resolve `{{variable}}` placeholders by walking the graph.
- [ ] Context assembly — build system prompt + rendered template + inherited framing.
- [ ] Provider dispatch — send assembled prompt to the agent's configured provider/model.
- [ ] Output parsing — split AI responses into single bubbles, chains, or parallel branches.
- [ ] Action menu — right-click a bubble to see and invoke available actions.
- [ ] Auto-actions — configurable actions that fire automatically on bubble creation.
- [ ] Agent enable/disable — user can toggle agents on/off per session.

### Phase 4 — Framing & Problem Space

- [ ] Context bubbles — user or AI adds background info inherited by descendants.
- [ ] Constraint bubbles — hard boundaries; toggleable on/off.
- [ ] Assumption bubbles — explicit assumptions; challengeable (creates a branch with the assumption inverted).
- [ ] Criterion bubbles — evaluation standards used in comparisons.
- [ ] Visual inheritance: framing bubbles display as tags/annotations on the subtree they affect.

### Phase 5 — Branching & Exploration

- [ ] Branch from any Clarification bubble with multiple user Answers.
- [ ] Branch from any Step bubble with alternative approaches.
- [ ] Provocation bubbles — lateral reframing that spawns a new branch.
- [ ] Independent continuation of each branch.
- [ ] Side-by-side Comparison bubbles scored against active Criteria.
- [ ] Critique bubbles — identify risks/flaws referencing specific Criteria.
- [ ] Synthesis bubbles — merge insights from multiple branches (multi-parent DAG node).
- [ ] Prune / collapse dead-end branches.

### Phase 6 — Persistence & History

- [ ] Persist conversation graphs across sessions (server-side storage).
- [ ] Undo / redo for bubble operations.
- [ ] Name and bookmark individual graphs for later reference.

### Phase 7 — Polish & Power Features

- [ ] Collapse / expand subtrees.
- [ ] Search across all bubble contents.
- [ ] Export conversation graph as JSON or image.
- [ ] Keyboard shortcuts for navigation and bubble creation.
- [ ] Theming support (dark / light).
