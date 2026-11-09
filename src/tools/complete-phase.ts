// packages/mcp-server/src/tools/complete-phase.ts

import { existsSync } from 'fs';

import {
  PHASES,
  WAI_WAY_DIR,
  getProtocol,
  saveProtocol,
  safePath,
  checkFileConventions,
  checkSymbolUsage,
  checkCoverageGate,
  loadContextForPhase,
  loadArgs,
  appendLesson,
  readImplementation,
  parseProgress,
  assertString,
  assertStringArray,
} from '../config';
import type { ToolResult } from '../config';

export const definition = {
  name: 'complete_phase',
  description:
    'Validate and submit phase for user review. Pass files to run convention checks and symbol verification. Phase stays pending until user calls approve_phase.',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: { type: 'string' },
        description:
          'File paths to validate (relative to project root). Convention checks + symbol usage verification run automatically.',
      },
      lesson: {
        type: 'string',
        description: 'Optional lesson learned during this phase',
      },
      summary: {
        type: 'string',
        description:
          'Brief outcome summary for the captain\'s log (e.g., "8 pages scaffolded, auth flow complete")',
      },
    },
  },
};

export function handler(args: Record<string, unknown> | undefined): ToolResult {
  const protocol = getProtocol();
  if (protocol.currentPhase === null) {
    return {
      content: [{ type: 'text', text: 'No active phase to complete.' }],
      isError: true,
    };
  }

  // Allow re-submission: if agent made changes after review, let them re-complete
  if (protocol.pendingReview) {
    protocol.pendingReview = false;
    saveProtocol(protocol);
  }

  const completedPhase = protocol.currentPhase;
  const completedName = protocol.phaseName;
  const moduleTag = protocol.currentModule
    ? ` [${protocol.currentModule}]`
    : '';
  const files: string[] =
    args?.files != null
      ? (assertStringArray(args.files, 'files'), args.files as string[])
      : [];

  // --- Validation (inline, replaces separate validate_phase) ---
  const validationIssues: string[] = [];
  const safeFiles: { original: string; resolved: string }[] = [];

  if (files.length > 0) {
    // Resolve and validate all file paths
    for (const file of files) {
      const resolved = safePath(file);
      if (!resolved) {
        validationIssues.push(
          `- BLOCKED: "${file}" resolves outside project root. Skipped.`
        );
        continue;
      }
      safeFiles.push({ original: file, resolved });
    }

    // 1. Convention checks on each file
    for (const sf of safeFiles) {
      const issues = checkFileConventions(sf.resolved);
      if (issues.length > 0) {
        validationIssues.push(
          `\n### ${sf.original}`,
          ...issues.map((iss) => `- ${iss}`)
        );
      }
    }

    // 2. Symbol usage check
    const symbolWarnings = checkSymbolUsage(
      safeFiles.map((sf) => sf.resolved),
      protocol.lookedUpSymbols
    );
    if (symbolWarnings.length > 0) {
      validationIssues.push(`\n### Unverified Component Usage`);
      validationIssues.push(...symbolWarnings.map((w) => `- ${w}`));
    }

    // 2b. CSS file detection — agents should never create custom CSS
    const cssFiles = safeFiles.filter((sf) =>
      /\.(css|module\.css|scss|sass|less)$/.test(sf.resolved)
    );
    if (cssFiles.length > 0) {
      validationIssues.push(`\n### Custom CSS Files`);
      for (const sf of cssFiles) {
        validationIssues.push(
          `- BLOCKED: "${sf.original}" — custom CSS files are not allowed. Use framework components, variant props, and theme tokens instead.`
        );
      }
    }
  }

  // 3. Coverage gate — reject if coverage dropped
  const coverageResult = checkCoverageGate();
  if (coverageResult) {
    validationIssues.push(`\n### Test Coverage`);
    validationIssues.push(coverageResult);
  }

  // 4. Check done_when criteria from context map
  const waiWayDir = existsSync(WAI_WAY_DIR) ? WAI_WAY_DIR : null;
  if (waiWayDir) {
    const ctx = loadContextForPhase(waiWayDir, completedPhase);
    if (ctx) {
      validationIssues.push(
        `\n### Done Criteria`,
        `**Required:** ${ctx.done_when}`,
        `**Expected output:** ${ctx.output}`,
        ``,
        `Verify these criteria are met.`
      );
    }
  }

  // If blocking issues found, behavior depends on args.strictness
  const projectArgs = loadArgs();
  const hasBlockingIssues = validationIssues.some(
    (i) =>
      i.startsWith('- L') ||
      i.includes('Unverified Component') ||
      i.includes('BLOCKED')
  );

  if (hasBlockingIssues && projectArgs.strictness === 'enforced') {
    // Enforced: block completion until issues are fixed
    const parts = [
      `## Validation Failed: Phase ${completedPhase} (${completedName})${moduleTag}`,
      ``,
      `**Status:** ISSUES FOUND — fix before completing phase`,
      `**Strictness:** enforced (change in .dndev/args.json to override)`,
      ...validationIssues,
      ``,
      `### Type Check`,
      `Run \`dndev type-check\` or \`bun run type-check\` to verify TypeScript compiles without errors.`,
      ``,
      `Fix the issues above, then call \`complete_phase({ files: [...] })\` again.`,
    ];
    return { content: [{ type: 'text', text: parts.join('\n') }] };
  }

  if (hasBlockingIssues && projectArgs.strictness === 'warnings') {
    // Warnings: report issues but allow completion
    validationIssues.unshift(
      `\n### Warnings (non-blocking)`,
      `**Strictness:** warnings — issues reported but phase can proceed.`
    );
  }
  // Permissive: skip convention checks entirely (validationIssues still logged but never block)

  // Record lesson if provided
  const lesson =
    args?.lesson != null
      ? (assertString(args.lesson, 'lesson'), args.lesson as string)
      : undefined;
  if (lesson) {
    const phaseTag =
      completedPhase !== null
        ? ` [Phase ${completedPhase}: ${completedName}]`
        : '';
    appendLesson(lesson, phaseTag);
  }

  // Store log data for captain's log (written on approve)
  const summary =
    args?.summary != null
      ? (assertString(args.summary, 'summary'), args.summary as string)
      : undefined;
  protocol.pendingLogData = {
    files_touched: safeFiles.length,
    summary,
    validation: hasBlockingIssues
      ? projectArgs.strictness === 'warnings'
        ? 'warnings'
        : 'failed'
      : 'passed',
  };

  // Set pending review — do NOT auto-advance
  protocol.pendingReview = true;
  saveProtocol(protocol);

  // Build review summary
  const symbolCount = protocol.lookedUpSymbols.length;
  const nextPhase = PHASES.find((p) => p.id === completedPhase + 1);
  const nextInfo = nextPhase
    ? `Next: Phase ${nextPhase.id} (${nextPhase.name})`
    : 'This was the final phase.';

  // Implementation progress stats
  let implLine = '';
  const implContent = readImplementation();
  if (implContent) {
    const { stats } = parseProgress(implContent, `Phase ${completedPhase}`);
    implLine = `**Implementation:** ${stats.done}/${stats.total} items (${stats.percent}%)`;
  }

  const parts = [
    `## Phase ${completedPhase} (${completedName})${moduleTag} — Ready for Review`,
    ``,
    `**Validation:** ${files.length > 0 ? 'PASSED' : 'No files provided (skipped)'}`,
    `**Symbols looked up:** ${symbolCount} (${protocol.lookedUpSymbols.join(', ') || 'none'})`,
    implLine,
    lesson ? `**Lesson recorded:** ${lesson}` : '',
    ``,
    `### User Review Required`,
    ``,
    `Present the phase output to the user. Ask them to verify:`,
    `- Does the output match what they expected?`,
    `- Are there any issues or changes needed?`,
    ``,
    `**After user confirms:** call \`approve_phase()\` to advance.`,
    `**If user wants changes:** make the changes, then call \`complete_phase({ files: [...] })\` again.`,
    ``,
    nextInfo,
  ].filter(Boolean);

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}
