// packages/mcp-server/src/tools/approve-phase.ts

import {
  PHASES,
  getProtocol,
  saveProtocol,
  readCaptainLog,
  addLogEntry,
  updateImplementationPhase,
} from '../config';

import type { ToolResult } from '../config';

export const definition = {
  name: 'approve_phase',
  description:
    'User approves the completed phase after review. Only call this after complete_phase and user has confirmed the output is correct.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export function handler(): ToolResult {
  const protocol = getProtocol();
  if (!protocol.pendingReview || protocol.currentPhase === null) {
    return {
      content: [
        {
          type: 'text',
          text: 'No phase pending review. Call complete_phase() first.',
        },
      ],
      isError: true,
    };
  }

  const completedPhase = protocol.currentPhase;
  const completedName = protocol.phaseName;

  // Write captain's log entry with enriched KPIs
  const log = readCaptainLog();
  addLogEntry({
    id: log.sessions.length + 1,
    date: new Date().toISOString().split('T')[0]!,
    phase: completedPhase,
    phase_name: completedName || PHASES[completedPhase]?.name || 'UNKNOWN',
    module: protocol.currentModule || undefined,
    started_at: protocol.startedAt || new Date().toISOString(),
    completed_at: new Date().toISOString(),
    outcome:
      protocol.pendingLogData?.summary ||
      `Phase ${completedPhase} (${completedName}) completed.`,
    files_touched: protocol.pendingLogData?.files_touched || 0,
    symbols_used: protocol.lookedUpSymbols.length,
    tool_calls:
      protocol.toolCallCounts && Object.keys(protocol.toolCallCounts).length > 0
        ? protocol.toolCallCounts
        : undefined,
    lessons_recorded: protocol.lessonsRecorded || undefined,
    lessons_scored:
      protocol.lessonsScored &&
      (protocol.lessonsScored.helpful > 0 || protocol.lessonsScored.harmful > 0)
        ? protocol.lessonsScored
        : undefined,
    validation: protocol.pendingLogData?.validation,
  });

  // Mark completed
  if (!protocol.completedPhases.includes(completedPhase)) {
    protocol.completedPhases.push(completedPhase);
  }
  protocol.currentPhase = null;
  protocol.phaseName = null;
  protocol.agent = null;
  protocol.startedAt = null;
  protocol.pendingReview = false;
  protocol.lookedUpSymbols = [];
  protocol.currentModule = null;
  protocol.pendingLogData = undefined;
  protocol.toolCallCounts = undefined;
  protocol.lessonsRecorded = undefined;
  protocol.lessonsScored = undefined;
  saveProtocol(protocol);

  const nextPhase = PHASES.find((p) => p.id === completedPhase + 1);
  const nextInfo = nextPhase
    ? `Next: call start_phase(${nextPhase.id}) to begin ${nextPhase.name}.`
    : 'All phases complete. App is ready.';

  // Update implementation.md phase marker
  if (nextPhase) {
    updateImplementationPhase(nextPhase.id, nextPhase.name);
  }

  return {
    content: [
      {
        type: 'text',
        text: `Phase ${completedPhase} (${completedName}) approved and completed.\n${nextInfo}`,
      },
    ],
  };
}
