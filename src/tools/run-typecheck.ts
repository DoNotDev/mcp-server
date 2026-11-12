// packages/mcp-server/src/tools/run-typecheck.ts

import { PROJECT_ROOT, expectString } from '../config';
import type { ToolResult } from '../config';

export const definition = {
  name: 'run_typecheck',
  description:
    'Run TypeScript type-check on the consumer project. Returns structured results. Run after every code change.',
  inputSchema: {
    type: 'object',
    properties: {
      package: {
        type: 'string',
        description:
          'Optional: scope to a specific app/package name or path fragment',
      },
    },
  },
};

export async function handler(
  args: Record<string, unknown> | undefined
): Promise<ToolResult> {
  const pkg =
    args?.package != null
      ? expectString(args.package, 'package')
      : undefined;
  const { execFileSync } = await import('child_process');

  const cmdArgs = ['tc'];
  if (pkg) cmdArgs.push(pkg);

  // Try 'dn' (internal CLI) first, fall back to 'dndev' (public CLI)
  let cmd = 'dn';
  try {
    execFileSync('dn', ['--version'], {
      encoding: 'utf8',
      stdio: 'ignore',
    });
  } catch {
    try {
      execFileSync('dndev', ['--version'], {
        encoding: 'utf8',
        stdio: 'ignore',
      });
      cmd = 'dndev';
    } catch {
      return {
        content: [
          {
            type: 'text',
            text: 'Neither "dn" nor "dndev" CLI found in PATH. Install @donotdev/cli or ensure packages/tooling is linked.',
          },
        ],
        isError: true,
      };
    }
  }

  try {
    const output = execFileSync(cmd, cmdArgs, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      env: { ...process.env, FORCE_COLOR: '0' }, // no ANSI colors
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Parse RESULT line
    const resultLine = output.split('\n').find((l) => l.startsWith('RESULT:'));
    return {
      content: [
        {
          type: 'text',
          text: output.trim() + (resultLine ? '' : '\nRESULT: unknown'),
        },
      ],
    };
  } catch (err: unknown) {
    // execFileSync throws on non-zero exit — stdout/stderr in err.stdout/err.stderr
    const execErr = err as { stdout?: string; stderr?: string };
    const output = (execErr.stdout ?? '') + (execErr.stderr ?? '');
    return {
      content: [
        {
          type: 'text',
          text: output.trim() || 'Type-check failed with no output',
        },
      ],
      isError: true,
    };
  }
}
