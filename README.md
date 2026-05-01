# DoNotDev MCP Server

Intelligence Engine for the DoNotDev framework. Provides type intelligence, convention enforcement, WAI-WAY phase tracking, and project-level memory with a closed lessons loop.

## Setup

### For Consumers (via bunx)

Pre-configured by `dndev init`. To re-configure: `dndev agent`.

**CLI:** Use `dndev` for commands (type-check, dev, deploy, init, etc.).

Manual setup — add to `.mcp.json` / `.gemini/settings.json`:

```json
{
  "mcpServers": {
    "donotdev": {
      "command": "bunx",
      "args": ["@donotdev/mcp-server@latest"]
    }
  }
}
```

**Note:** Use `bunx` — bun is a project requirement.

## Tools (13)

For the full tool reference with protocol context: [WAI-WAY Protocol - MCP Tools](../../docs/development/WAI_WAY_PROTOCOL.md)

### Phase Tracking

#### `start_phase`
Begin a WAI-WAY phase. Returns blueprint, agent definition, context, and lessons from previous sessions.

```
Input:  { "phase": 0 }
Input:  { "phase": 3, "module": "billing" }  ← scoped to module (large projects)
Output: Blueprint + agent persona + context + lessons + enforcement rules
```

#### `complete_phase`
Validate files and submit phase for user review. Convention checks + symbol verification run automatically when files are provided. Does NOT auto-advance.

```
Input:  { "files": ["src/pages/UsersPage.tsx"], "lesson": "Access rules must match spec" }
Output: Validation result. If clean → pending review. If issues → fix list.
```

#### `approve_phase`
User confirmed the phase output. Marks phase as completed.

```
Input:  {}
Output: Phase approved. Next: call start_phase(2) to begin ENTITIES.
```

#### `get_phase_status`
Current phase, symbols tracked, review status, completed phases.

```
Input:  {}
Output: Active: Phase 1 (SCAFFOLD), Symbols: 3, Pending review: no, Completed: 0: BRAINSTORM
```

### Knowledge

#### `lookup_symbol`
Get TypeScript types for any DoNotDev symbol. Reads actual `.d.ts` files. **Tracked per phase** — `complete_phase` flags components used without lookup.

```
Input:  { "symbol": "DataTable" }
Output: Full DataTableProps interface with JSDoc from @donotdev/crud
```

#### `get_guideline`
Fetch framework guidelines from each package’s `guidelines/` plus MCP-shipped setup docs (`SETUP_*`, `AGENT_START_HERE`, …). Full file when no `section`; use `topic:section` for a single heading.

```
Input:  { "topic": "styling:colors" }
Output: Colors section of styling guideline
```

#### `search_framework`
Search MCP guidelines, package `guidelines/`, and exported symbols.

```
Input:  { "query": "EntityList" }
Output: [SYMBOL] @donotdev/crud: EntityList, EntityListProps
        [GUIDELINE] crud/ENTITIES.md
```

### Memory

#### `record_lesson`
Append a lesson to `.dndev/LESSONS.md`. Auto-tags with current phase. **Lessons are returned on the next `start_phase` call** — closing the loop.

```
Input:  { "lesson": "Firebase emulator must be running for auth tests" }
Output: Lesson recorded. It will be included in the next start_phase() call.
```

## How It Works

```
start_phase(N)          → blueprint + context + lessons
  ↓
work                    → follow blueprint, lookup_symbol for every component
  ↓
complete_phase(files)   → convention check + symbol verification + submit for review
  ↓
[user reviews]
  ↓
approve_phase()         → phase done, advance
```

No MCP-level file gating. The IDE handles file write approval natively. Consumer repos ship with Claude Code hooks that enforce `lookup_symbol()` usage - see [Agent Harness](../../docs/development/WAI_WAY_PROTOCOL.md).

## Security

- **Path traversal protection:** File paths in `complete_phase` are resolved and verified against project root
- **Project root discovery:** Walks up from cwd looking for `AGENTS.md`, `.dndev/`, or `package.json`
- **Lessons capped:** Only the last 50 lines of LESSONS.md are returned to prevent context bloat
- **Protocol versioning:** Auto-resets on version mismatch (prevents stale state)
- **Bounded search:** `findNodeModules` limited to 10 directory levels
