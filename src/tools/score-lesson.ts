// packages/mcp-server/src/tools/score-lesson.ts

import { scoreLesson, trackLessonScored, assertString } from '../config';
import type { ToolResult } from '../config';

export const definition = {
  name: 'score_lesson',
  description:
    'Score a lesson as helpful or harmful. Updates confidence metadata. Lessons decay over time (half-life: 90 days). High harmful ratio auto-converts to anti-pattern.',
  inputSchema: {
    type: 'object',
    properties: {
      lesson: {
        type: 'string',
        description:
          'Substring to match the lesson (e.g., "Zustand store actions", "use client directive")',
      },
      outcome: {
        type: 'string',
        enum: ['helpful', 'harmful'],
        description: 'Whether this lesson helped or harmed the current task',
      },
    },
    required: ['lesson', 'outcome'],
  },
};

export function handler(args: Record<string, unknown> | undefined): ToolResult {
  assertString(args?.lesson, 'lesson');
  assertString(args?.outcome, 'outcome');
  const lessonSubstring = args?.lesson;
  const outcome = args?.outcome;
  if (outcome !== 'helpful' && outcome !== 'harmful') {
    return {
      content: [
        { type: 'text', text: 'outcome must be "helpful" or "harmful"' },
      ],
      isError: true,
    };
  }
  const { found, newStatus } = scoreLesson(lessonSubstring, outcome);
  if (found) trackLessonScored(outcome);
  if (!found) {
    return {
      content: [
        {
          type: 'text',
          text: `No lesson found matching "${lessonSubstring}".`,
        },
      ],
      isError: true,
    };
  }
  const statusEmoji: Record<string, string> = {
    candidate: 'candidate',
    established: 'established (3+ helpful)',
    proven: 'proven (10+ helpful)',
    deprecated: 'DEPRECATED (>25% harmful)',
    'anti-pattern': 'ANTI-PATTERN (>50% harmful, auto-inverted as PITFALL)',
  };
  return {
    content: [
      {
        type: 'text',
        text: `Lesson scored as ${outcome}. Status: ${statusEmoji[newStatus] ?? newStatus}.`,
      },
    ],
  };
}
