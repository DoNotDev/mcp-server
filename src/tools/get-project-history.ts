// packages/mcp-server/src/tools/get-project-history.ts

import { readCaptainLog } from '../config';
import type { ToolResult } from '../config';

export const definition = {
  name: 'get_project_history',
  description:
    "Get the captain's log: full session history with metrics. For post-mortem, team review, and project analysis.",
  inputSchema: { type: 'object', properties: {} },
};

export function handler(): ToolResult {
  const log = readCaptainLog();
  if (log.sessions.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: "No sessions logged yet. Captain's log entries are created automatically when phases are approved.",
        },
      ],
    };
  }

  const totalFiles = log.sessions.reduce((s, e) => s + e.files_touched, 0);
  const totalSymbols = log.sessions.reduce((s, e) => s + e.symbols_used, 0);
  const phasesCompleted = [...new Set(log.sessions.map((e) => e.phase))].length;

  const parts = [
    `## Captain's Log — ${log.project}`,
    `**Started:** ${log.started}`,
    `**Sessions:** ${log.sessions.length}`,
    `**Phases completed:** ${phasesCompleted}/5`,
    `**Total files touched:** ${totalFiles}`,
    `**Total symbols used:** ${totalSymbols}`,
    '',
    '### Timeline',
  ];

  for (const entry of log.sessions) {
    const module = entry.module ? ` [${entry.module}]` : '';
    const kpis: string[] = [];
    if (entry.files_touched) kpis.push(`${entry.files_touched} files`);
    if (entry.symbols_used) kpis.push(`${entry.symbols_used} symbols`);
    if (entry.tool_calls) {
      const totalCalls = Object.values(entry.tool_calls).reduce(
        (a, b) => a + b,
        0
      );
      kpis.push(`${totalCalls} tool calls`);
    }
    if (entry.lessons_recorded) kpis.push(`${entry.lessons_recorded} lessons`);
    if (entry.lessons_scored) {
      const s = entry.lessons_scored;
      kpis.push(`scored ${s.helpful}H/${s.harmful}X`);
    }
    if (entry.validation) kpis.push(`validation: ${entry.validation}`);
    const kpiStr = kpis.length > 0 ? ` (${kpis.join(', ')})` : '';
    parts.push(
      `${entry.id}. **[${entry.date}]** Phase ${entry.phase} (${entry.phase_name})${module} — ${entry.outcome}${kpiStr}`
    );
  }

  parts.push('', `Raw JSON: .dndev/captain-log.json`);

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}
