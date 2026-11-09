// packages/mcp-server/src/tools/get-phase-status.ts

import { getProtocol, PHASES } from '../config';
import type { ToolResult } from '../config';

export const definition = {
  name: 'get_phase_status',
  description:
    'Get current WAI-WAY phase, completed phases, active agent, lookup coverage, and pending review status.',
  inputSchema: { type: 'object', properties: {} },
};

export function handler(): ToolResult {
  const protocol = getProtocol();
  const completed = protocol.completedPhases
    .sort()
    .map((id) => {
      const p = PHASES.find((ph) => ph.id === id);
      return p ? `${p.id}: ${p.name}` : `${id}`;
    })
    .join(', ');

  if (protocol.currentPhase === null) {
    return {
      content: [
        {
          type: 'text',
          text: `No active phase.\nCompleted: ${completed || 'none'}\nCall start_phase(N) to begin a phase.`,
        },
      ],
    };
  }

  const parts = [
    `Active: Phase ${protocol.currentPhase} (${protocol.phaseName})`,
    `Agent: ${protocol.agent}`,
    `Started: ${protocol.startedAt}`,
    protocol.currentModule ? `Module: ${protocol.currentModule}` : null,
    `Pending review: ${protocol.pendingReview ? 'YES — user must approve' : 'no'}`,
    `Symbols looked up: ${protocol.lookedUpSymbols.length} (${protocol.lookedUpSymbols.join(', ') || 'none'})`,
    `Completed phases: ${completed || 'none'}`,
  ].filter(Boolean);

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}
