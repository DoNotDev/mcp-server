// packages/mcp-server/src/tools/setup-coach.ts

import {
  MCP_GUIDELINES_DIR,
  readGuideFile,
  assertString,
  appendFrameworkRecoverHint,
} from '../config';

import type { ToolResult } from '../config';

export const definition = {
  name: 'setup_coach',
  description:
    'Get contextual setup instructions for a specific manual step. Reads MCP-shipped SETUP_*.md examples — never accesses .env or secrets. Returns markdown coaching for dashboard-click steps.',
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description:
          'Setup topic (e.g., "stripe-webhook", "oauth-google", "firebase-service-account", "supabase-credentials")',
      },
      provider: {
        type: 'string',
        description:
          'Optional provider context (firebase, supabase, vercel, stripe)',
      },
      projectId: {
        type: 'string',
        description:
          'Optional project ID for generating console URLs (public, not a secret)',
      },
      region: {
        type: 'string',
        description:
          'Optional Firebase Cloud Functions region (e.g., "europe-west1", "us-central1"). Defaults to europe-west1.',
      },
    },
    required: ['topic'],
  },
};

export function handler(args: Record<string, unknown> | undefined): ToolResult {
  assertString(args?.topic, 'topic');
  const topic = args!.topic as string;
  const provider =
    typeof args?.provider === 'string' ? args.provider : undefined;
  const projectId =
    typeof args?.projectId === 'string' ? args.projectId : undefined;

  const topicToBase: Record<string, string> = {
    'stripe-webhook': 'SETUP_STRIPE',
    'stripe-keys': 'SETUP_STRIPE',
    stripe: 'SETUP_STRIPE',
    'oauth-google': 'SETUP_OAUTH_PROVIDERS',
    'oauth-github': 'SETUP_OAUTH_PROVIDERS',
    'oauth-apple': 'SETUP_OAUTH_PROVIDERS',
    oauth: 'SETUP_OAUTH_PROVIDERS',
    'firebase-service-account': 'SETUP_FIREBASE',
    'firebase-enable-services': 'SETUP_FIREBASE',
    firebase: 'SETUP_FIREBASE',
    'supabase-credentials': 'SETUP_SUPABASE',
    'supabase-secret-key': 'SETUP_SUPABASE',
    'supabase-rls': 'SETUP_SUPABASE',
    supabase: 'SETUP_SUPABASE',
    'vercel-domain': 'SETUP_VERCEL',
    vercel: 'SETUP_VERCEL',
    'auth-firebase': 'SETUP_AUTH',
    'auth-supabase': 'SETUP_AUTH',
    auth: 'SETUP_AUTH',
    billing: 'SETUP_BILLING',
    soc2: 'SETUP_SOC2',
  };

  const base =
    topicToBase[topic.toLowerCase()] ??
    topicToBase[provider?.toLowerCase() ?? ''] ??
    `SETUP_${topic.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;

  let guideContent = readGuideFile(MCP_GUIDELINES_DIR, base);

  if (!guideContent) {
    return {
      content: [
        {
          type: 'text',
          text: appendFrameworkRecoverHint(
            `No setup guide found for topic "${topic}". Try \`get_guideline("${topic}")\` or \`search_framework("${topic}")\`. Available coached topics: ${Object.keys(topicToBase).join(', ')}`
          ),
        },
      ],
      isError: true,
    };
  }

  if (projectId) {
    guideContent = guideContent.replace(/\{\{PROJECT_ID\}\}/g, projectId);
  }
  const region = args?.region;
  guideContent = guideContent.replace(
    /\{\{REGION\}\}/g,
    typeof region === 'string' ? region : 'europe-west1'
  );

  return {
    content: [
      {
        type: 'text',
        text: guideContent,
      },
    ],
  };
}
