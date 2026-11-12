// packages/mcp-server/src/tools/start-phase.ts

import { existsSync } from 'fs';
import { join } from 'path';

import {
  PHASES,
  WAI_WAY_DIR,
  getProtocol,
  saveProtocol,
  PROTOCOL_VERSION,
  flushSessionToCaptainLog,
  readGuideFile,
  loadContextForPhase,
  readLessons,
  readImplementation,
  parseProgress,
  readCaptainLog,
  loadArgs,
  getGotchasForPhase,
  assertNumber,
  expectString,
} from '../config';
import type { ToolResult } from '../config';

export const definition = {
  name: 'start_phase',
  description:
    'Begin a WAI-WAY phase (0-4). Returns blueprint, agent definition, context, and lessons. For large projects, pass module to scope work.',
  inputSchema: {
    type: 'object',
    properties: {
      phase: {
        type: 'number',
        description:
          'Phase number: 0=BRAINSTORM, 1=SCAFFOLD, 2=ENTITIES, 3=COMPOSE, 4=CONFIGURE',
      },
      module: {
        type: 'string',
        description:
          'Optional module name to scope work (e.g., "user-management", "billing"). For large projects.',
      },
    },
    required: ['phase'],
  },
};

export function handler(args: Record<string, unknown> | undefined): ToolResult {
  // Safety net: flush any stale data from an abandoned previous session
  flushSessionToCaptainLog();

  assertNumber(args?.phase, 'phase');
  const phaseId = args?.phase;
  const module =
    args?.module != null
      ? expectString(args.module, 'module')
      : undefined;
  const phase = PHASES.find((p) => p.id === phaseId);
  if (!phase) {
    return {
      content: [
        { type: 'text', text: `Invalid phase: ${phaseId}. Valid: 0-4.` },
      ],
      isError: true,
    };
  }

  const waiWayDir = existsSync(WAI_WAY_DIR) ? WAI_WAY_DIR : null;
  if (!waiWayDir) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: WAI-WAY assets missing from @donotdev/mcp-server. Run `bun install` in your project root. Framework source: https://github.com/SkillsAreImba/dndev',
        },
      ],
      isError: true,
    };
  }

  // Load blueprint + agent def
  const blueprint = readGuideFile(
    join(waiWayDir, 'blueprints'),
    phase.blueprint
  );
  const agentDef = readGuideFile(join(waiWayDir, 'agents'), phase.agentFile);

  // Load context map
  const ctx = loadContextForPhase(waiWayDir, phaseId);

  // Load lessons (filtered by phase + module tags)
  const lessons = readLessons({ phase: phaseId, module: module });

  // Update protocol
  const protocol = getProtocol();
  protocol.version = PROTOCOL_VERSION;
  protocol.currentPhase = phase.id;
  protocol.phaseName = phase.name;
  protocol.agent = phase.agent;
  protocol.startedAt = new Date().toISOString();
  protocol.lookedUpSymbols = [];
  protocol.pendingReview = false;
  protocol.currentModule = module || null;
  protocol.toolCallCounts = undefined;
  protocol.lessonsRecorded = undefined;
  protocol.lessonsScored = undefined;
  saveProtocol(protocol);

  // Build response
  const parts: string[] = [
    `# Phase ${phase.id}: ${phase.name}`,
    `**Agent:** ${phase.agent}`,
  ];

  if (module) parts.push(`**Module:** ${module}`);

  // Macro summary — project state at a glance
  const completedList = protocol.completedPhases.sort().map((id) => {
    const p = PHASES.find((ph) => ph.id === id);
    return p ? p.name : `${id}`;
  });
  const implContent = readImplementation();
  const implStats = implContent ? parseProgress(implContent) : null;
  const captainLog = readCaptainLog();

  const macroLines = [`\n## Project State`];
  macroLines.push(
    `- **Phase:** ${phase.id}/4 ${phase.name}${completedList.length > 0 ? ` (done: ${completedList.join(', ')})` : ''}`
  );
  if (implStats) {
    macroLines.push(
      `- **Progress:** ${implStats.stats.done}/${implStats.stats.total} (${implStats.stats.percent}%)`
    );
  }
  if (captainLog.sessions.length > 0) {
    macroLines.push(`- **Sessions so far:** ${captainLog.sessions.length}`);
  }
  parts.push(...macroLines);

  if (ctx) {
    parts.push(
      `\n## Phase Context`,
      `**Goal:** ${ctx.goal}`,
      `**Done when:** ${ctx.done_when}`,
      `**Output:** ${ctx.output}`,
      `**Read these files first:**`,
      ...ctx.read_files.map((f: string) => `- ${f}`)
    );
  }

  if (blueprint) parts.push(`\n---\n## Blueprint\n\n${blueprint}`);
  if (agentDef) parts.push(`\n---\n## Agent Definition\n\n${agentDef}`);

  // Lessons from previous sessions (filtered by phase + module)
  if (lessons.trim().length > 20) {
    parts.push(`\n---\n## Lessons (Filtered)\n\n${lessons}`);
  }

  // Implementation progress (cross-session continuity)
  if (implContent) {
    const { stats, filtered } = parseProgress(implContent, `Phase ${phaseId}`);
    parts.push(
      `\n---\n## Implementation Progress`,
      `**Overall:** ${stats.done}/${stats.total} (${stats.percent}%)`,
      ``,
      filtered,
      ``,
      `Use \`update_progress({ item: "...", done: true })\` to tick items as you complete them.`
    );
  } else if (phaseId > 0) {
    parts.push(
      `\n---\n## Implementation Progress`,
      `No implementation.md found. Consider running \`init_implementation({ from_spec: true })\` to track progress across sessions.`
    );
  }

  // Enforcement reminders
  const trackedSymbols =
    protocol.lookedUpSymbols.length > 0
      ? protocol.lookedUpSymbols.join(', ')
      : 'none (call lookup_symbol to add)';

  const enforcementRules: string[] = [
    `\n---\n## Enforcement Rules`,
    `- **BEFORE using any @donotdev component:** call \`lookup_symbol("ComponentName")\``,
    `- **AFTER building:** call \`complete_phase({ files: [...], summary: "..." })\` — validates + submits for review`,
    `- **WHEN recording a lesson:** also add a \`// GOTCHA: ...\` comment in the relevant source file`,
    `- **NEVER create .md files** unless explicitly asked — session notes go in \`.dndev/\``,
    `- Tracked symbols so far: ${trackedSymbols}`,
  ];

  // Phase 3+ gets strict convention enforcement rules
  if (phaseId >= 3) {
    enforcementRules.push(
      ``,
      `### Convention Enforcement (Phase ${phaseId})`,
      `These are checked by \`complete_phase\` and WILL BLOCK completion in enforced mode:`,
      ``,
      `**NO native HTML elements.** The following tags are forbidden in @donotdev files:`,
      `\`<div>\` \`<span>\` \`<p>\` \`<h1-6>\` \`<button>\` \`<a>\` \`<input>\` \`<textarea>\` \`<select>\` \`<form>\` \`<table>\` \`<tr>\` \`<td>\` \`<th>\` \`<ul>\` \`<ol>\` \`<li>\` \`<img>\` \`<section>\` \`<nav>\` \`<header>\` \`<footer>\``,
      `Use instead: Stack, Card, Section, Box, Text, Button, Link, TextInput, Select, Form, DataTable, List, Image, Navigation, Header, Footer`,
      ``,
      `**NO custom CSS files.** Never create \`.css\`, \`.module.css\`, \`.scss\`, \`.sass\`, or \`.less\` files. Use variant props, theme tokens, and framework layout.`,
      ``,
      `**NO custom component files.** Do not create files in \`components/\`. Compose pages using framework components. If a component is missing, say what you need and STOP.`,
      ``,
      `**NO inventing props.** Only use props returned by \`lookup_symbol()\`. Common hallucination traps:`,
      `\`size\` \`tone\` \`color\` \`padding\` \`margin\` \`spacing\` \`columns\` \`background\` \`fields\` — NONE of these exist.`,
      ``,
      `**NO Tailwind utilities.** Do not use \`bg-\`, \`text-\`, \`p-\`, \`m-\`, \`flex\`, \`grid\`, \`w-\`, \`h-\`, etc. in className.`
    );
  }

  parts.push(...enforcementRules);

  // Skill recommendations per phase
  const skillRecs: Record<number, string[]> = {
    0: [],
    1: [],
    2: [],
    3: [
      'After composing, run `/grill` to review code quality before moving to Phase 4.',
    ],
    4: [
      'Run `/grill` for a staff-engineer code review.',
      'Run `/techdebt` to surface cleanup items before shipping.',
    ],
  };
  const recs = skillRecs[phaseId] || [];
  if (recs.length > 0) {
    parts.push(
      `\n---\n## Recommended Skills`,
      ...recs.map((r: string) => `- ${r}`)
    );
  }

  // Project args
  const projectArgs = loadArgs();
  parts.push(
    `\n---\n## Project Args`,
    `- **Platform:** ${projectArgs.platform}`,
    `- **Strictness:** ${projectArgs.strictness}`,
    `- **Features:** ${projectArgs.features.join(', ')}`,
    `- **Region:** ${projectArgs.region}`
  );

  // Phase-relevant gotchas
  const gotchas = getGotchasForPhase(phaseId, projectArgs.features);
  if (gotchas) {
    parts.push(`\n---\n## Gotchas (Phase ${phaseId})\n\n${gotchas}`);
  }

  if (!blueprint && !agentDef)
    parts.push('\nNo blueprint or agent definition found for this phase.');

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}
