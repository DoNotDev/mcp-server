// packages/mcp-server/src/tools/record-lesson.ts

import { existsSync, readFileSync } from 'fs';

import {
  getProtocol,
  LESSONS_FILE,
  appendLesson,
  readCaptainLog,
  trackLessonRecorded,
  assertString,
  assertStringArray,
} from '../config';

import type { ToolResult } from '../config';

export const definition = {
  name: 'record_lesson',
  description:
    'Record a lesson/gotcha to .dndev/LESSONS.md with inline tags. Filtered by phase + module on next start_phase. Also add a code comment where the gotcha applies.',
  inputSchema: {
    type: 'object',
    properties: {
      lesson: {
        type: 'string',
        description:
          'The lesson content (gotcha, quirk, operational knowledge)',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Tags for filtering: entity names, service names, module names (e.g., ["stripe", "billing", "webhook"])',
      },
    },
    required: ['lesson'],
  },
};

export function handler(args: Record<string, unknown> | undefined): ToolResult {
  assertString(args?.lesson, 'lesson');
  const lesson = args!.lesson as string;
  const tags =
    args?.tags != null
      ? (assertStringArray(args.tags, 'tags'), args.tags as string[])
      : undefined;
  const protocol = getProtocol();
  const phaseTag =
    protocol.currentPhase !== null
      ? ` [Phase ${protocol.currentPhase}: ${protocol.phaseName}]`
      : '';

  // Evidence gate: check if a similar lesson already exists
  const existing = existsSync(LESSONS_FILE)
    ? readFileSync(LESSONS_FILE, 'utf-8')
    : '';
  const lessonWords = lesson
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4);
  const duplicateLines = existing.split('\n').filter((line) => {
    if (!line.startsWith('- [')) return false;
    const lower = line.toLowerCase();
    const matchCount = lessonWords.filter((w) => lower.includes(w)).length;
    return matchCount >= Math.min(3, lessonWords.length);
  });

  // Cross-reference captain-log for corroboration
  const log = readCaptainLog();
  const relevantSessions = log.sessions.filter((s) => {
    if (tags && tags.length > 0 && s.module) {
      return tags.some((t) =>
        s.module!.toLowerCase().includes(t.toLowerCase())
      );
    }
    if (protocol.currentPhase !== null) {
      return s.phase === protocol.currentPhase;
    }
    return false;
  });

  let evidenceNote = '';
  if (duplicateLines.length > 0) {
    evidenceNote = `\n**Similar lesson exists** — consider scoring the existing one instead of recording a duplicate.`;
  }
  if (relevantSessions.length > 0) {
    evidenceNote += `\n**Corroborated** by ${relevantSessions.length} prior session(s) in same phase/module.`;
  } else if (log.sessions.length > 0) {
    evidenceNote += `\n**Uncorroborated** — no prior sessions match. Starts as candidate, needs validation.`;
  }

  appendLesson(lesson, phaseTag, tags);
  trackLessonRecorded();
  const tagInfo = tags && tags.length > 0 ? ` [${tags.join(', ')}]` : '';
  return {
    content: [
      {
        type: 'text',
        text: `Lesson recorded${tagInfo}. Filtered by tags on next start_phase().${evidenceNote}\nAlso add a \`// GOTCHA: ...\` comment in the relevant source file.`,
      },
    ],
  };
}
