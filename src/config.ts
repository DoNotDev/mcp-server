// packages/mcp-server/src/config.ts
// Shared state, constants, types, and helpers for all MCP tool handlers.

import {
  readFileSync,
  existsSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from 'fs';
import { join, dirname, resolve, normalize, sep, basename } from 'path';
import { fileURLToPath } from 'url';

// ==========================================================================
// TYPES
// ==========================================================================

export interface ToolResult {
  [x: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// ==========================================================================
// PACKAGE VERSION
// ==========================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
/** Root of the published `@donotdev/mcp-server` package (contains `wai-way/`, `guidelines/`). */
export const MCP_PACKAGE_ROOT = join(__dirname, '..');
export const PKG_VERSION: string = JSON.parse(
  readFileSync(join(MCP_PACKAGE_ROOT, 'package.json'), 'utf-8')
).version;

/** Open-source framework repo (recovery hint when local files are missing). */
export const FRAMEWORK_REPO_URL = 'https://github.com/SkillsAreImba/dndev';

/** Appended when disk lookups return nothing so users recover offline / broken installs. */
export function appendFrameworkRecoverHint(message: string): string {
  return `${message}\n\nIf framework docs are missing, run \`bun install\` in your project root. The framework is open source: ${FRAMEWORK_REPO_URL}`;
}

// ==========================================================================
// CONSTANTS
// ==========================================================================

export const PROTOCOL_VERSION = 2;
const MAX_NODE_MODULES_DEPTH = 10;

// --- Project Root Discovery ---

/** Walk up from cwd looking for AGENTS.md, .dndev/, or package.json to find project root */
function findProjectRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < MAX_NODE_MODULES_DEPTH; i++) {
    if (
      existsSync(join(dir, 'AGENTS.md')) ||
      existsSync(join(dir, '.dndev')) ||
      existsSync(join(dir, 'package.json'))
    ) {
      return dir;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export const PROJECT_ROOT = findProjectRoot();

// --- Constants (derived from project root) ---
export const PROTOCOL_DIR = join(PROJECT_ROOT, '.dndev');
export const PROTOCOL_FILE = join(PROTOCOL_DIR, 'protocol.json');
export const LESSONS_FILE = join(PROTOCOL_DIR, 'LESSONS.md');
export const IMPLEMENTATION_FILE = join(PROTOCOL_DIR, 'implementation.md');
export const CAPTAIN_LOG_FILE = join(PROTOCOL_DIR, 'captain-log.json');
export const ARGS_FILE = join(PROTOCOL_DIR, 'args.json');

// --- WAI-WAY + MCP-shipped guidelines (SSOT) ---
// WAI-WAY blueprints ship inside `@donotdev/mcp-server` — not under the consumer repo `guides/`.
export const WAI_WAY_DIR = join(MCP_PACKAGE_ROOT, 'wai-way');
/** Setup + agent quickstart markdown shipped with the MCP package (`SETUP_*.md.example`, etc.). */
export const MCP_GUIDELINES_DIR = join(MCP_PACKAGE_ROOT, 'guidelines');

export const IS_MONOREPO = existsSync(join(PROJECT_ROOT, 'packages', 'cli'));

// --- Package Guidelines Resolution ---
// Each package can own guidelines in a `guidelines/` directory.
// Monorepo: packages/*/guidelines/ and packages/*/*/guidelines/ (nested like features/crud)
// Consumer: node_modules/@donotdev/*/guidelines/
export function getPackageGuidelineDirs(): Array<{ dir: string; pkg: string }> {
  const dirs: Array<{ dir: string; pkg: string }> = [];
  if (IS_MONOREPO) {
    const packagesDir = join(PROJECT_ROOT, 'packages');
    if (existsSync(packagesDir)) {
      for (const entry of readdirSync(packagesDir)) {
        const entryPath = join(packagesDir, entry);
        // Direct: packages/core/guidelines/
        const guidelinesDir = join(entryPath, 'guidelines');
        if (existsSync(guidelinesDir))
          dirs.push({ dir: guidelinesDir, pkg: entry });
        // Nested: packages/features/crud/guidelines/
        const pkgJson = join(entryPath, 'package.json');
        if (!existsSync(pkgJson)) {
          try {
            for (const sub of readdirSync(entryPath)) {
              const subGuidelines = join(entryPath, sub, 'guidelines');
              if (existsSync(subGuidelines))
                dirs.push({ dir: subGuidelines, pkg: sub });
            }
          } catch {
            /* not a directory */
          }
        }
      }
    }
  } else {
    const nm = findNodeModules();
    if (nm) {
      const dndevDir = join(nm, '@donotdev');
      if (existsSync(dndevDir)) {
        for (const pkg of readdirSync(dndevDir)) {
          const guidelinesDir = join(dndevDir, pkg, 'guidelines');
          if (existsSync(guidelinesDir)) dirs.push({ dir: guidelinesDir, pkg });
        }
      }
    }
  }
  return dirs;
}

// ==========================================================================
// WAI-WAY PHASES
// ==========================================================================

export const PHASES = [
  {
    id: 0,
    name: 'BRAINSTORM',
    agent: 'extractor',
    blueprint: '0_brainstorm',
    agentFile: 'extractor',
  },
  {
    id: 1,
    name: 'SCAFFOLD',
    agent: 'extractor',
    blueprint: '1_scaffold',
    agentFile: 'extractor',
  },
  {
    id: 2,
    name: 'ENTITIES',
    agent: 'architect',
    blueprint: '2_entities',
    agentFile: 'architect',
  },
  {
    id: 3,
    name: 'COMPOSE',
    agent: 'builder',
    blueprint: '3_compose',
    agentFile: 'builder',
  },
  {
    id: 4,
    name: 'CONFIGURE',
    agent: 'polisher',
    blueprint: '4_configure',
    agentFile: 'polisher',
  },
] as const;

// ==========================================================================
// PROTOCOL STATE
// ==========================================================================

export interface Protocol {
  version: number;
  currentPhase: number | null;
  phaseName: string | null;
  agent: string | null;
  startedAt: string | null;
  completedPhases: number[];
  lookedUpSymbols: string[];
  pendingReview: boolean;
  currentModule: string | null;
  pendingLogData?: {
    files_touched: number;
    summary?: string;
    validation?: 'passed' | 'warnings' | 'failed';
  };
  /** Aggregated tool call counts for current phase */
  toolCallCounts?: Record<string, number>;
  /** Lesson KPIs for current phase */
  lessonsRecorded?: number;
  lessonsScored?: { helpful: number; harmful: number };
}

export const DEFAULT_PROTOCOL: Protocol = {
  version: PROTOCOL_VERSION,
  currentPhase: null,
  phaseName: null,
  agent: null,
  startedAt: null,
  completedPhases: [],
  lookedUpSymbols: [],
  pendingReview: false,
  currentModule: null,
};

/** In-memory protocol cache — avoids file I/O on every tool call */
let _protocolCache: Protocol | null = null;
let _protocolDirty = false;

export function getProtocol(): Protocol {
  if (_protocolCache) return _protocolCache;
  const fresh = (): Protocol => ({
    ...DEFAULT_PROTOCOL,
    completedPhases: [],
    lookedUpSymbols: [],
  });
  // Try main file, then .tmp fallback (crash recovery)
  for (const path of [PROTOCOL_FILE, PROTOCOL_FILE + '.tmp']) {
    if (!existsSync(path)) continue;
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8'));
      if (raw.version !== PROTOCOL_VERSION) continue;
      const cached: Protocol = { ...DEFAULT_PROTOCOL, ...raw };
      _protocolCache = cached;
      return cached;
    } catch {
      continue;
    }
  }
  _protocolCache = fresh();
  return _protocolCache;
}

/** Write-through: hooks and new sessions read protocol.json while the server runs. */
export function saveProtocol(protocol: Protocol) {
  _protocolCache = protocol;
  _protocolDirty = true;
  flushProtocol();
}

/** Atomic write — write to .tmp then rename to prevent truncated JSON on crash */
export function atomicWriteSync(filePath: string, data: string) {
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, data);
  renameSync(tmp, filePath);
}

/** Flush cached protocol to disk (called on exit + phase boundaries) */
export function flushProtocol() {
  if (!_protocolDirty || !_protocolCache) return;
  if (!existsSync(PROTOCOL_DIR)) mkdirSync(PROTOCOL_DIR, { recursive: true });
  atomicWriteSync(PROTOCOL_FILE, JSON.stringify(_protocolCache, null, 2));
  _protocolDirty = false;
}

/** Increment tool call counter — always tracks, even outside phases */
export function trackToolCall(toolName: string) {
  const protocol = getProtocol();
  if (!protocol.toolCallCounts) protocol.toolCallCounts = {};
  protocol.toolCallCounts[toolName] =
    (protocol.toolCallCounts[toolName] ?? 0) + 1;
  saveProtocol(protocol);
}

/** Track a lesson being recorded */
export function trackLessonRecorded() {
  const protocol = getProtocol();
  protocol.lessonsRecorded = (protocol.lessonsRecorded ?? 0) + 1;
  saveProtocol(protocol);
}

/** Track a lesson being scored */
export function trackLessonScored(outcome: 'helpful' | 'harmful') {
  const protocol = getProtocol();
  if (!protocol.lessonsScored)
    protocol.lessonsScored = { helpful: 0, harmful: 0 };
  protocol.lessonsScored[outcome]++;
  saveProtocol(protocol);
}

/** Reset all caches (used by reload tool).
 * Flushes dirty protocol to disk first, then clears caches
 * so next access re-reads from disk. */
export function resetCaches() {
  flushProtocol();
  _symbolIndex = null;
  _protocolCache = null;
}

// ==========================================================================
// PROJECT ARGS
// ==========================================================================

export interface Args {
  platform: 'firebase' | 'vercel';
  strictness: 'enforced' | 'warnings' | 'permissive';
  features: string[];
  region: string;
}

export const DEFAULT_ARGS: Args = {
  platform: 'firebase',
  strictness: 'enforced',
  features: ['crud', 'auth', 'i18n', 'billing', 'oauth', 'functions'],
  region: 'europe-west1',
};

export function loadArgs(): Args {
  if (!existsSync(ARGS_FILE)) return { ...DEFAULT_ARGS };
  try {
    const raw = JSON.parse(readFileSync(ARGS_FILE, 'utf-8'));
    return { ...DEFAULT_ARGS, ...raw };
  } catch {
    return { ...DEFAULT_ARGS };
  }
}

// ==========================================================================
// GOTCHAS
// ==========================================================================

interface GotchaSection {
  title: string;
  phases: number[];
  content: string;
}

function parseGotchasFile(filePath: string): GotchaSection[] {
  const content = readFileSync(filePath, 'utf-8');
  const sections: GotchaSection[] = [];
  const parts = content.split(/^## /m);

  for (const part of parts) {
    if (!part.trim()) continue;
    const firstNewline = part.indexOf('\n');
    if (firstNewline === -1) continue;

    const title = part.substring(0, firstNewline).trim();
    const body = part.substring(firstNewline + 1).trim();

    const phaseMatch = title.match(/\[Phase\s+([\d,\s]+)\]/i);
    const phases: number[] = [];
    if (phaseMatch?.[1]) {
      for (const p of phaseMatch[1].split(',')) {
        const num = parseInt(p.trim());
        if (!isNaN(num)) phases.push(num);
      }
    }

    if (phases.length > 0 && body) {
      sections.push({
        title: title.replace(/\s*\[Phase.*?\]/, ''),
        phases,
        content: body,
      });
    }
  }

  return sections;
}

function parseGotchas(): GotchaSection[] {
  const merged: GotchaSection[] = [];
  const seen = new Set<string>();
  for (const { dir } of getPackageGuidelineDirs()) {
    for (const name of ['GOTCHAS.md', 'GOTCHAS.md.example']) {
      const candidate = join(dir, name);
      if (!existsSync(candidate)) continue;
      for (const s of parseGotchasFile(candidate)) {
        const key = `${s.title}::${s.phases.join(',')}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(s);
      }
    }
  }
  return merged;
}

export function getGotchasForPhase(
  phaseId: number,
  features?: string[]
): string {
  const sections = parseGotchas();
  if (sections.length === 0) return '';

  const relevant = sections.filter((s) => s.phases.includes(phaseId));
  if (relevant.length === 0) return '';

  // Skip feature-specific sections if feature not enabled
  const featureMap: Record<string, string> = {
    CRUD: 'crud',
    Functions: 'functions',
    i18n: 'i18n',
  };

  const filtered = features
    ? relevant.filter((s) => {
        const requiredFeature = featureMap[s.title];
        return !requiredFeature || features.includes(requiredFeature);
      })
    : relevant;

  if (filtered.length === 0) return '';
  return filtered
    .map((s) => `### ${s.title}\n\n${s.content}`)
    .join('\n\n---\n\n');
}

// ==========================================================================
// PATH SAFETY
// ==========================================================================

/** Resolve a file path relative to project root and verify it stays within bounds */
export function safePath(filePath: string): string | null {
  const normalizedRoot = normalize(PROJECT_ROOT) + sep;
  const normalizedResolved = normalize(resolve(PROJECT_ROOT, filePath));
  if (
    !normalizedResolved.startsWith(normalizedRoot) &&
    normalizedResolved !== normalize(PROJECT_ROOT)
  ) {
    return null;
  }
  return normalizedResolved;
}

// ==========================================================================
// LESSONS (tagged, filtered, scored)
// ==========================================================================

/** Confidence half-life in days — confidence halves every 90 days without revalidation */
const LESSON_HALF_LIFE_DAYS = 90;
/** Harmful outcomes are weighted 4x more than helpful ones */
const HARMFUL_MULTIPLIER = 4;
/** Minimum confidence score (after decay) to include a lesson in context */
const MIN_CONFIDENCE = 0.15;

/** Parse the scoring metadata suffix from a lesson line: {helpful:N,harmful:N,lastSeen:YYYY-MM-DD} */
function parseLessonScore(line: string): {
  helpful: number;
  harmful: number;
  lastSeen: string | null;
  status:
    | 'candidate'
    | 'established'
    | 'proven'
    | 'deprecated'
    | 'anti-pattern';
} {
  const match = line.match(
    /\{helpful:(\d+),harmful:(\d+),lastSeen:([^,}]+)(?:,status:([^}]+))?\}$/
  );
  if (!match)
    return { helpful: 0, harmful: 0, lastSeen: null, status: 'candidate' };
  return {
    helpful: parseInt(match[1]!),
    harmful: parseInt(match[2]!),
    lastSeen: match[3]!,
    status: (match[4] as any) || 'candidate',
  };
}

/** Compute effective confidence after time decay: 0.5^(daysAgo / halfLife) */
function computeConfidence(score: {
  helpful: number;
  harmful: number;
  lastSeen: string | null;
}): number {
  if (score.lastSeen === null) return 0.5; // legacy entry, neutral confidence
  const daysAgo =
    (Date.now() - new Date(score.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.pow(0.5, daysAgo / LESSON_HALF_LIFE_DAYS);
  const rawScore = score.helpful - score.harmful * HARMFUL_MULTIPLIER;
  // Normalize: map raw to 0..1 range, then apply decay
  const base =
    rawScore >= 0
      ? 0.5 + Math.min(rawScore / 10, 0.5)
      : Math.max(0.1, 0.5 + rawScore / 10);
  return base * decayFactor;
}

/** Compute maturity status based on helpful/harmful counts */
function computeStatus(score: {
  helpful: number;
  harmful: number;
}): 'candidate' | 'established' | 'proven' | 'deprecated' | 'anti-pattern' {
  const total = score.helpful + score.harmful;
  if (total === 0) return 'candidate';
  const harmfulRatio = score.harmful / total;
  if (harmfulRatio > 0.5 && score.harmful >= 3) return 'anti-pattern';
  if (harmfulRatio > 0.25) return 'deprecated';
  if (score.helpful >= 10 && harmfulRatio < 0.1) return 'proven';
  if (score.helpful >= 3 && harmfulRatio < 0.25) return 'established';
  return 'candidate';
}

/** Strip the scoring suffix from a lesson line for display */
function stripScoreSuffix(line: string): string {
  return line.replace(/\s*\{helpful:\d+,harmful:\d+,lastSeen:[^}]+\}$/, '');
}

/** Update the scoring suffix on a lesson line */
function updateScoreSuffix(
  line: string,
  score: { helpful: number; harmful: number; lastSeen: string; status: string }
): string {
  const stripped = stripScoreSuffix(line);
  return `${stripped} {helpful:${score.helpful},harmful:${score.harmful},lastSeen:${score.lastSeen},status:${score.status}}`;
}

/**
 * Read lessons filtered by phase and/or module tags.
 * Untagged lessons are always included. Tagged lessons are included
 * if they match current phase (or phase-1) or current module.
 * Lessons below MIN_CONFIDENCE after decay are excluded.
 * Anti-pattern lessons are prefixed with PITFALL.
 */
export function readLessons(filter?: {
  phase?: number;
  module?: string;
}): string {
  if (!existsSync(LESSONS_FILE)) return '';
  const content = readFileSync(LESSONS_FILE, 'utf-8');
  if (!filter) return content;

  const lines = content.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    if (!line.startsWith('- [')) {
      result.push(line);
      continue;
    }

    // Confidence decay filter
    const score = parseLessonScore(line);
    const confidence = computeConfidence(score);
    if (confidence < MIN_CONFIDENCE) continue; // stale, skip
    if (score.status === 'deprecated') continue; // explicitly deprecated

    // Extract phase number from [Phase N: NAME]
    const phaseMatch = line.match(/\[Phase (\d+):/);
    const linePhase = phaseMatch ? parseInt(phaseMatch[1]!) : null;

    // Extract custom tags: bracket groups that aren't date or Phase
    const allBrackets = [...line.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]!);
    const customTags = allBrackets
      .filter(
        (b) =>
          !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(b) &&
          !/^Phase \d+:/.test(b) &&
          !/^\d{4}-\d{2}-\d{2}$/.test(b)
      )
      .flatMap((b) => b.split(',').map((t) => t.trim().toLowerCase()))
      .filter(Boolean);

    const isUntagged = customTags.length === 0;
    const phaseRelevant =
      filter.phase !== undefined &&
      linePhase !== null &&
      (linePhase === filter.phase || linePhase === filter.phase - 1);
    const moduleRelevant =
      !!filter.module && customTags.includes(filter.module.toLowerCase());

    if (isUntagged || phaseRelevant || moduleRelevant) {
      // Anti-pattern lessons get PITFALL prefix
      if (score.status === 'anti-pattern') {
        const stripped = stripScoreSuffix(line);
        const lessonText = stripped.replace(
          /^- \[[^\]]*\](\[[^\]]*\])*\s*/,
          ''
        );
        const prefix = stripped.substring(
          0,
          stripped.length - lessonText.length
        );
        result.push(`${prefix}PITFALL: ${lessonText}`);
      } else {
        result.push(stripScoreSuffix(line));
      }
    }
  }

  const filtered = result.join('\n').trim();
  if (!filtered || filtered === '# Lessons Learned') return '';
  return filtered;
}

/** Append a lesson with optional inline tags and scoring metadata */
export function appendLesson(
  lesson: string,
  phaseTag: string = '',
  tags?: string[]
) {
  const tagStr = tags && tags.length > 0 ? `[${tags.join(', ')}]` : '';
  const today = new Date().toISOString().split('T')[0]!;
  const scoreSuffix = ` {helpful:0,harmful:0,lastSeen:${today},status:candidate}`;
  const entry = `\n- [${today}]${phaseTag}${tagStr} ${lesson}${scoreSuffix}`;
  try {
    if (!existsSync(PROTOCOL_DIR)) mkdirSync(PROTOCOL_DIR, { recursive: true });
    if (!existsSync(LESSONS_FILE)) {
      writeFileSync(LESSONS_FILE, '# Lessons Learned\n' + entry);
    } else {
      const existing = readFileSync(LESSONS_FILE, 'utf-8');
      atomicWriteSync(LESSONS_FILE, existing + entry);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to write lesson: ${message}`);
  }
}

/**
 * Score a lesson as helpful or harmful. Updates the scoring suffix in-place.
 * Returns the new status after scoring.
 *
 * NOTE: read-modify-write without file locking — concurrent MCP sessions
 * can cause lost updates (last-write-wins). Acceptable: single-agent usage
 * is the norm, and atomicWriteSync prevents corruption.
 */
export function scoreLesson(
  lessonSubstring: string,
  outcome: 'helpful' | 'harmful'
): { found: boolean; newStatus: string } {
  if (!existsSync(LESSONS_FILE)) return { found: false, newStatus: '' };
  const content = readFileSync(LESSONS_FILE, 'utf-8');
  const lines = content.split('\n');
  let found = false;
  let newStatus = '';

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.startsWith('- [')) continue;
    if (!lines[i]!.toLowerCase().includes(lessonSubstring.toLowerCase()))
      continue;

    const score = parseLessonScore(lines[i]!);
    const today = new Date().toISOString().split('T')[0]!;
    if (outcome === 'helpful') score.helpful++;
    else score.harmful++;
    score.lastSeen = today;
    const status = computeStatus(score);
    newStatus = status;

    // Anti-pattern conversion: invert the lesson
    lines[i] = updateScoreSuffix(lines[i]!, {
      helpful: score.helpful,
      harmful: score.harmful,
      lastSeen: today,
      status,
    });
    found = true;
    break;
  }

  if (found) {
    atomicWriteSync(LESSONS_FILE, lines.join('\n'));
  }
  return { found, newStatus };
}

// ==========================================================================
// COVERAGE GATE
// ==========================================================================

const COVERAGE_BASELINE_FILE = join(PROTOCOL_DIR, 'coverage-baseline.json');

interface CoverageBaseline {
  lines: number;
  branches: number;
  functions: number;
  timestamp: string;
}

/** Parse LCOV summary from coverage/lcov.info or coverage-summary.json */
function parseCoverageSummary(): {
  lines: number;
  branches: number;
  functions: number;
} | null {
  // Try JSON summary first (vitest --coverage produces this)
  const jsonPath = join(PROJECT_ROOT, 'coverage', 'coverage-summary.json');
  if (existsSync(jsonPath)) {
    try {
      const raw = JSON.parse(readFileSync(jsonPath, 'utf-8'));
      const total = raw.total;
      if (total) {
        return {
          lines: total.lines?.pct ?? 0,
          branches: total.branches?.pct ?? 0,
          functions: total.functions?.pct ?? 0,
        };
      }
    } catch {
      /* fall through to LCOV */
    }
  }

  // Fallback: parse lcov.info
  const lcovPath = join(PROJECT_ROOT, 'coverage', 'lcov.info');
  if (!existsSync(lcovPath)) return null;

  try {
    const content = readFileSync(lcovPath, 'utf-8');
    let linesHit = 0,
      linesTotal = 0;
    let branchesHit = 0,
      branchesTotal = 0;
    let fnsHit = 0,
      fnsTotal = 0;

    for (const line of content.split('\n')) {
      if (line.startsWith('LH:')) linesHit += parseInt(line.slice(3)) || 0;
      if (line.startsWith('LF:')) linesTotal += parseInt(line.slice(3)) || 0;
      if (line.startsWith('BRH:')) branchesHit += parseInt(line.slice(4)) || 0;
      if (line.startsWith('BRF:'))
        branchesTotal += parseInt(line.slice(4)) || 0;
      if (line.startsWith('FNH:')) fnsHit += parseInt(line.slice(4)) || 0;
      if (line.startsWith('FNF:')) fnsTotal += parseInt(line.slice(4)) || 0;
    }

    return {
      lines: linesTotal > 0 ? (linesHit / linesTotal) * 100 : 0,
      branches: branchesTotal > 0 ? (branchesHit / branchesTotal) * 100 : 0,
      functions: fnsTotal > 0 ? (fnsHit / fnsTotal) * 100 : 0,
    };
  } catch {
    return null;
  }
}

/** Load the coverage baseline snapshot */
function loadCoverageBaseline(): CoverageBaseline | null {
  if (!existsSync(COVERAGE_BASELINE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(COVERAGE_BASELINE_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

/** Save a new coverage baseline snapshot */
function saveCoverageBaseline(coverage: {
  lines: number;
  branches: number;
  functions: number;
}) {
  if (!existsSync(PROTOCOL_DIR)) mkdirSync(PROTOCOL_DIR, { recursive: true });
  const baseline: CoverageBaseline = {
    ...coverage,
    timestamp: new Date().toISOString(),
  };
  writeFileSync(COVERAGE_BASELINE_FILE, JSON.stringify(baseline, null, 2));
}

/**
 * Check coverage gate: compare current coverage against baseline.
 * Returns a validation message if coverage dropped, null if OK or unavailable.
 * Auto-saves baseline on first run.
 */
export function checkCoverageGate(): string | null {
  const current = parseCoverageSummary();
  if (!current) return null; // no coverage data, skip

  const baseline = loadCoverageBaseline();
  if (!baseline) {
    // First run — set baseline, no gate
    saveCoverageBaseline(current);
    return `- Coverage baseline set: ${current.lines.toFixed(1)}% lines, ${current.branches.toFixed(1)}% branches, ${current.functions.toFixed(1)}% functions`;
  }

  const drops: string[] = [];
  if (current.lines < baseline.lines - 0.5) {
    drops.push(
      `Lines: ${current.lines.toFixed(1)}% (was ${baseline.lines.toFixed(1)}%)`
    );
  }
  if (current.branches < baseline.branches - 0.5) {
    drops.push(
      `Branches: ${current.branches.toFixed(1)}% (was ${baseline.branches.toFixed(1)}%)`
    );
  }
  if (current.functions < baseline.functions - 0.5) {
    drops.push(
      `Functions: ${current.functions.toFixed(1)}% (was ${baseline.functions.toFixed(1)}%)`
    );
  }

  if (drops.length > 0) {
    return `- BLOCKED: Test coverage decreased:\n  ${drops.join('\n  ')}\n  Run tests with coverage and add tests for new code.`;
  }

  // Coverage maintained or improved — update baseline
  saveCoverageBaseline(current);
  return null;
}

// ==========================================================================
// IMPLEMENTATION PROGRESS
// ==========================================================================

export interface ProgressStats {
  total: number;
  done: number;
  pending: number;
  percent: number;
}

export interface SectionStats {
  title: string;
  total: number;
  done: number;
}

export function readImplementation(): string | null {
  if (!existsSync(IMPLEMENTATION_FILE)) return null;
  return readFileSync(IMPLEMENTATION_FILE, 'utf-8');
}

export function writeImplementation(content: string) {
  if (!existsSync(PROTOCOL_DIR)) mkdirSync(PROTOCOL_DIR, { recursive: true });
  atomicWriteSync(IMPLEMENTATION_FILE, content);
}

/** Parse implementation.md and compute progress stats */
export function parseProgress(
  content: string,
  sectionFilter?: string
): { stats: ProgressStats; sections: SectionStats[]; filtered: string } {
  const lines = content.split('\n');
  const sections: SectionStats[] = [];
  let currentSection: SectionStats | null = null;
  let totalDone = 0;
  let totalItems = 0;

  // Collect section-level stats
  for (const line of lines) {
    if (/^###?\s/.test(line) && !line.startsWith('# Implementation')) {
      if (currentSection) sections.push(currentSection);
      currentSection = { title: line.replace(/^#+\s*/, ''), total: 0, done: 0 };
    }
    if (/^\s*- \[x\]/i.test(line)) {
      totalDone++;
      totalItems++;
      if (currentSection) currentSection.done++;
      if (currentSection) currentSection.total++;
    } else if (/^\s*- \[ \]/.test(line)) {
      totalItems++;
      if (currentSection) currentSection.total++;
    }
  }
  if (currentSection) sections.push(currentSection);

  // Filter to specific section if requested
  let filtered = content;
  if (sectionFilter) {
    const filterLower = sectionFilter.toLowerCase();
    const sectionLines: string[] = [];
    let inSection = false;
    for (const line of lines) {
      if (/^###?\s/.test(line)) {
        inSection = line.toLowerCase().includes(filterLower);
      }
      if (inSection) sectionLines.push(line);
    }
    filtered = sectionLines.length > 0 ? sectionLines.join('\n') : content;
  }

  return {
    stats: {
      total: totalItems,
      done: totalDone,
      pending: totalItems - totalDone,
      percent: totalItems > 0 ? Math.round((totalDone / totalItems) * 100) : 0,
    },
    sections: sections.filter((s) => s.total > 0),
    filtered,
  };
}

/** Generate implementation.md content from structured sections */
export function generateImplementationContent(
  sections: { title: string; items: string[] }[]
): string {
  const lines = [
    '# Implementation Progress',
    '',
    `**Last updated:** ${new Date().toISOString()}`,
    `**Current phase:** 0 - BRAINSTORM`,
    '',
  ];

  for (const section of sections) {
    lines.push(`### ${section.title}`);
    for (const item of section.items) {
      lines.push(`- [ ] ${item}`);
    }
    lines.push('');
  }

  lines.push('## Notes', '');
  return lines.join('\n');
}

/** Auto-generate sections from spec_template.md */
export function generateFromSpec():
  | { title: string; items: string[] }[]
  | null {
  const waiWayDir = existsSync(WAI_WAY_DIR) ? WAI_WAY_DIR : null;
  if (!waiWayDir) return null;

  const spec = readGuideFile(waiWayDir, 'spec_template');
  if (!spec) return null;

  const sections: { title: string; items: string[] }[] = [
    {
      title: 'Phase 0: BRAINSTORM',
      items: ['Spec complete', 'User validated'],
    },
  ];

  // Extract entities from spec
  const entityMatches = spec.matchAll(/### Entity:\s*\[?(\w+)\]?/g);
  const entities: string[] = [];
  for (const m of entityMatches) {
    if (m[1] && m[1] !== 'Name') entities.push(m[1]);
  }

  // Extract pages from spec
  const pageMatches = spec.matchAll(/\|\s*`?\/[\w-]*`?\s*\|\s*(\w+Page)\s*\|/g);
  const pages: string[] = [];
  for (const m of pageMatches) {
    if (m[1]) pages.push(m[1]);
  }

  // Build phase sections
  sections.push({
    title: 'Phase 1: SCAFFOLD',
    items:
      pages.length > 0
        ? pages.map((p) => `${p}.tsx`)
        : ['(generate from validated spec)'],
  });

  sections.push({
    title: 'Phase 2: ENTITIES',
    items:
      entities.length > 0
        ? entities.map((e) => `${e} entity`)
        : ['(generate from validated spec)'],
  });

  sections.push({
    title: 'Phase 3: COMPOSE',
    items:
      pages.length > 0
        ? pages.map((p) => `${p} composition`)
        : ['(generate from validated spec)'],
  });

  sections.push({
    title: 'Phase 4: CONFIGURE',
    items: [
      'Tests generated',
      'Firestore rules',
      'Config finalized',
      'Mobile check',
    ],
  });

  return sections;
}

/** Update the "Current phase" line in implementation.md */
export function updateImplementationPhase(phaseId: number, phaseName: string) {
  const content = readImplementation();
  if (!content) return;
  const updated = content.replace(
    /\*\*Current phase:\*\*\s*.*/,
    `**Current phase:** ${phaseId} - ${phaseName}`
  );
  if (updated !== content) {
    writeImplementation(
      updated.replace(
        /\*\*Last updated:\*\*\s*.*/,
        `**Last updated:** ${new Date().toISOString()}`
      )
    );
  }
}

// ==========================================================================
// CAPTAIN'S LOG
// ==========================================================================

export interface CaptainLogEntry {
  id: number;
  date: string;
  phase: number;
  phase_name: string;
  module?: string;
  started_at: string;
  completed_at: string;
  outcome: string;
  files_touched: number;
  symbols_used: number;
  /** Aggregated tool call counts: { "lookup_symbol": 8, "get_guideline": 2 } */
  tool_calls?: Record<string, number>;
  /** Lessons recorded during this phase */
  lessons_recorded?: number;
  /** Lessons scored during this phase: { helpful: N, harmful: N } */
  lessons_scored?: { helpful: number; harmful: number };
  /** Validation result from complete_phase */
  validation?: 'passed' | 'warnings' | 'failed';
}

export interface CaptainLog {
  project: string;
  started: string;
  sessions: CaptainLogEntry[];
}

export function readCaptainLog(): CaptainLog {
  const fresh = (): CaptainLog => ({
    project: basename(PROJECT_ROOT) || 'unknown',
    started: new Date().toISOString().split('T')[0]!,
    sessions: [],
  });
  // Try main file, then .tmp fallback (crash recovery)
  for (const path of [CAPTAIN_LOG_FILE, CAPTAIN_LOG_FILE + '.tmp']) {
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      continue;
    }
  }
  return fresh();
}

export function addLogEntry(entry: CaptainLogEntry) {
  const log = readCaptainLog();
  log.sessions.push(entry);
  if (!existsSync(PROTOCOL_DIR)) mkdirSync(PROTOCOL_DIR, { recursive: true });
  atomicWriteSync(CAPTAIN_LOG_FILE, JSON.stringify(log, null, 2));
}

/**
 * Flush accumulated session data to captain-log.
 * Works for both phased (WAI-WAY) and ad-hoc (non-phase) sessions.
 * Called on process exit and as safety net on start_phase.
 */
export function flushSessionToCaptainLog() {
  const protocol = getProtocol();

  // Nothing to flush if no tool calls were made
  const totalCalls = protocol.toolCallCounts
    ? Object.values(protocol.toolCallCounts).reduce((a, b) => a + b, 0)
    : 0;
  if (totalCalls === 0) return;

  const log = readCaptainLog();
  const entry: CaptainLogEntry = {
    id: log.sessions.length + 1,
    date: new Date().toISOString().split('T')[0]!,
    phase: protocol.currentPhase ?? -1,
    phase_name: protocol.phaseName || 'ad-hoc',
    module: protocol.currentModule || undefined,
    started_at: protocol.startedAt || new Date().toISOString(),
    completed_at: new Date().toISOString(),
    outcome:
      protocol.pendingLogData?.summary ||
      (protocol.currentPhase !== null
        ? `Phase ${protocol.currentPhase} (${protocol.phaseName}) — session ended without approval`
        : 'Ad-hoc session'),
    files_touched: protocol.pendingLogData?.files_touched || 0,
    symbols_used: protocol.lookedUpSymbols?.length || 0,
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
  };

  addLogEntry(entry);

  // Reset counters (but keep phase state — it may resume)
  protocol.toolCallCounts = undefined;
  protocol.lessonsRecorded = undefined;
  protocol.lessonsScored = undefined;
  protocol.pendingLogData = undefined;
  saveProtocol(protocol);
  flushProtocol(); // Phase boundary — persist to disk
}

// ==========================================================================
// SYMBOL INDEX
// ==========================================================================

export interface SymbolEntry {
  pkg: string;
  definition: string;
}

/** Lazy symbol index: symbol name → { pkg, definition } */
let _symbolIndex: Map<string, SymbolEntry> | null = null;

/**
 * Pre-built symbol index of a package: dist/ (published), src/ (monorepo,
 * survives cacheout), types/src/ (core in the monorepo), then the package root
 * (published core, whose dist/ is flattened to the root).
 */
export function findSymbolIndexFile(nodeModules: string, pkgName: string): string | null {
  for (const dir of ['dist', 'src', join('types', 'src'), '.']) {
    const candidate = join(nodeModules, pkgName, dir, 'symbol-index.json');
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function getSymbolIndex(nodeModules: string): Map<string, SymbolEntry> {
  if (_symbolIndex && _symbolIndex.size > 0) return _symbolIndex;
  _symbolIndex = new Map();

  const PRIORITY_PACKAGES = [
    '@donotdev/core',
    '@donotdev/ui',
    '@donotdev/crud',
  ];
  const packagesToIndex = [
    ...PRIORITY_PACKAGES,
    ...LOCAL_PACKAGES.filter((p) => !PRIORITY_PACKAGES.includes(p)),
  ];

  // Try pre-built symbol-index.json first (generated by dn bundle)
  // Check dist/ (published), then src/ (survives cacheout in monorepo)
  let usedPrebuilt = false;
  for (const pkgName of packagesToIndex) {
    const indexPath = findSymbolIndexFile(nodeModules, pkgName);
    if (!indexPath) continue;
    try {
      const raw = JSON.parse(readFileSync(indexPath, 'utf-8')) as Record<
        string,
        string
      >;
      for (const [symbol, definition] of Object.entries(raw)) {
        if (!_symbolIndex.has(symbol)) {
          _symbolIndex.set(symbol, { pkg: pkgName, definition });
        }
      }
      usedPrebuilt = true;
    } catch {
      // Corrupted index file, fall through to .d.ts scan
    }
  }

  if (usedPrebuilt && _symbolIndex.size > 0) return _symbolIndex;

  // Fallback: scan .d.ts files directly (slow on WSL2/Windows)
  for (const pkgName of packagesToIndex) {
    const distPath = join(nodeModules, pkgName, 'dist');
    if (!existsSync(distPath)) continue;
    for (const dtsPath of findDtsFiles(distPath)) {
      const content = readFileSync(dtsPath, 'utf-8');
      const exports = getExports(content);
      for (const exp of exports) {
        if (_symbolIndex.has(exp)) continue;
        const definition = extractDefinition(content, exp);
        if (definition) {
          _symbolIndex.set(exp, { pkg: pkgName, definition });
        }
      }
    }
  }

  return _symbolIndex;
}

// ==========================================================================
// FRAMEWORK PACKAGE REGISTRY
// ==========================================================================

export const LOCAL_PACKAGES = [
  '@donotdev/core',
  '@donotdev/ui',
  '@donotdev/components',
  '@donotdev/templates',
  '@donotdev/crud',
  '@donotdev/auth',
  '@donotdev/billing',
  '@donotdev/oauth',
  '@donotdev/firebase',
  '@donotdev/supabase', // npm name; monorepo source is at packages/providers/supabase
  '@donotdev/functions',
  '@donotdev/security',
  '@donotdev/expo',
  '@donotdev/mcp-server',
];

export const GLOBAL_TOOLS = ['@donotdev/cli'];
export const PACKAGES = [...LOCAL_PACKAGES, ...GLOBAL_TOOLS];

// ==========================================================================
// FILE DISCOVERY
// ==========================================================================

export function findNodeModules(): string | null {
  let dir = PROJECT_ROOT;
  for (let i = 0; i < MAX_NODE_MODULES_DEPTH; i++) {
    const nm = join(dir, 'node_modules');
    if (existsSync(nm)) return nm;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function readGuideFile(dir: string, baseName: string): string | null {
  for (const ext of ['.md', '.md.example']) {
    const filePath = join(dir, baseName + ext);
    if (existsSync(filePath)) return readFileSync(filePath, 'utf-8');
  }
  return null;
}

function findDtsFiles(dir: string, maxDepth: number = 5): string[] {
  if (!existsSync(dir) || maxDepth <= 0) return [];
  const entries = readdirSync(dir);
  // Files FIRST, then directories — barrel index.d.ts wins "first match" over deep files
  const files: string[] = [];
  const dirs: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        dirs.push(fullPath);
      } else if (entry.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    } catch {
      // Skip inaccessible files
    }
  }
  for (const d of dirs) {
    files.push(...findDtsFiles(d, maxDepth - 1));
  }
  return files;
}

/** Escape a string for safe use in a RegExp */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Extract the brace-delimited body starting at `startIndex` using depth counting (no regex). */
function extractDefinitionBody(content: string, startIndex: number): string {
  let depth = 0;
  let start = -1;
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (content[i] === '}') {
      depth--;
      if (depth === 0) return content.slice(start, i + 1);
    }
  }
  return '';
}

export function extractDefinition(
  content: string,
  name: string
): string | null {
  const escapedName = escapeRegExp(name);
  // Step 1: Find the declaration WITHOUT JSDoc (avoids greedy [\s\S]*? spanning entire file)
  const declRegex = new RegExp(
    `(?:export\\s+)?(?:declare\\s+)?(?:interface|type|const|function|class)\\s+${escapedName}\\b`,
    'g'
  );
  const declMatch = declRegex.exec(content);
  if (!declMatch) return null;

  // Step 2: Look backward for an immediately preceding JSDoc block
  let headerStart = declMatch.index;
  const before = content.slice(0, declMatch.index);
  const jsdocEnd = before.lastIndexOf('*/');
  if (jsdocEnd !== -1) {
    // Check only whitespace between */ and declaration
    const gap = before.slice(jsdocEnd + 2);
    if (/^\s*$/.test(gap)) {
      const jsdocStart = before.lastIndexOf('/**', jsdocEnd);
      if (jsdocStart !== -1) headerStart = jsdocStart;
    }
  }
  const afterHeader = declMatch.index + declMatch[0].length;

  // Find the first '{' or ';' after the header to determine the shape
  const rest = content.slice(afterHeader);
  const braceIdx = rest.indexOf('{');
  const semiIdx = rest.indexOf(';');

  // Statement terminated by ';' (e.g. type alias without braces)
  if (semiIdx !== -1 && (braceIdx === -1 || semiIdx < braceIdx)) {
    return content.slice(headerStart, afterHeader + semiIdx + 1).trim();
  }

  // Brace-delimited body — use depth-counting extraction
  if (braceIdx !== -1) {
    const body = extractDefinitionBody(content, afterHeader + braceIdx);
    if (body)
      return content
        .slice(headerStart, afterHeader + braceIdx + body.length)
        .trim();
  }

  return null;
}

export function getExports(content: string): string[] {
  const exports: string[] = [];
  const reExports = content.matchAll(/export\s*\{([^}]+)\}/g);
  for (const m of reExports) {
    if (m[1]) {
      const names = m[1]
        .split(',')
        .map((n) => {
          const parts = n.trim().split(/\s+as\s+/);
          // Use alias (after "as") if present, otherwise use the original name
          return (parts.length > 1 ? parts[1] : parts[0])?.trim();
        })
        .filter((n): n is string => !!n);
      exports.push(...names);
    }
  }
  const interfaces = content.matchAll(
    /export\s+(?:declare\s+)?interface\s+(\w+)/g
  );
  for (const m of interfaces) if (m[1]) exports.push(m[1]);
  const types = content.matchAll(/export\s+(?:declare\s+)?type\s+(\w+)/g);
  for (const m of types) if (m[1]) exports.push(m[1]);
  const consts = content.matchAll(/export\s+(?:declare\s+)?const\s+(\w+)/g);
  for (const m of consts) if (m[1]) exports.push(m[1]);
  const functions = content.matchAll(
    /export\s+(?:declare\s+)?function\s+(\w+)/g
  );
  for (const m of functions) if (m[1]) exports.push(m[1]);
  const classes = content.matchAll(/export\s+(?:declare\s+)?class\s+(\w+)/g);
  for (const m of classes) if (m[1]) exports.push(m[1]);
  const defaults = content.matchAll(/export\s+default\s+(\w+)/g);
  for (const m of defaults) if (m[1]) exports.push(m[1]);
  return [...new Set(exports)].filter((n) => n && n !== 'default');
}

/** Extract the first non-empty line after the # Title from a README.md */
export function extractReadmeSummary(readmePath: string): string | null {
  if (!existsSync(readmePath)) return null;
  try {
    const lines = readFileSync(readmePath, 'utf-8').split('\n');
    let foundTitle = false;
    for (const line of lines) {
      if (line.startsWith('# ')) {
        foundTitle = true;
        continue;
      }
      if (foundTitle && line.trim().length > 0) return line.trim();
    }
  } catch {}
  return null;
}

/** Load context_map.json and return the phase entry */
export function loadContextForPhase(
  waiWayDir: string,
  phaseId: number
): {
  goal: string;
  done_when: string;
  output: string;
  read_files: string[];
} | null {
  const cmPath = existsSync(join(waiWayDir, 'context_map.json'))
    ? join(waiWayDir, 'context_map.json')
    : join(waiWayDir, 'context_map.json.example');
  if (!existsSync(cmPath)) return null;
  try {
    const contextMap = JSON.parse(readFileSync(cmPath, 'utf-8'));
    const phaseKeys = Object.keys(contextMap.phases || {});
    const phaseKey = phaseKeys.find((k) => k.startsWith(`${phaseId}_`));
    if (phaseKey && contextMap.phases[phaseKey])
      return contextMap.phases[phaseKey];
  } catch {}
  return null;
}

// ==========================================================================
// CONVENTION CHECKS
// ==========================================================================

/** Native HTML tags → framework replacement guidance */
export const HTML_ALTERNATIVES: Record<string, string> = {
  div: 'Stack, Card, Section, or Box from @donotdev/components',
  span: 'Text from @donotdev/components',
  p: 'Text from @donotdev/components',
  h1: 'Text level={1} from @donotdev/components',
  h2: 'Text level={2} from @donotdev/components',
  h3: 'Text level={3} from @donotdev/components',
  h4: 'Text level={4} from @donotdev/components',
  h5: 'Text level={5} from @donotdev/components',
  h6: 'Text level={6} from @donotdev/components',
  button: 'Button from @donotdev/components',
  a: 'Link from @donotdev/components',
  input: 'TextInput from @donotdev/components',
  textarea: 'TextInput multiline from @donotdev/components',
  select: 'Select from @donotdev/components',
  form: 'Form from @donotdev/components',
  table: 'DataTable from @donotdev/crud',
  tr: 'DataTable from @donotdev/crud',
  td: 'DataTable from @donotdev/crud',
  th: 'DataTable from @donotdev/crud',
  ul: 'List from @donotdev/components',
  ol: 'List ordered from @donotdev/components',
  li: 'List.Item from @donotdev/components',
  img: 'Image from @donotdev/components',
  section: 'Section from @donotdev/components',
  nav: 'Navigation from @donotdev/ui',
  header: 'Header from @donotdev/ui',
  footer: 'Footer from @donotdev/ui',
};

const HTML_TAG_NAMES = Object.keys(HTML_ALTERNATIVES);

/** Props that agents hallucinate — never exist on framework components */
const DENIED_PROPS: { prop: string; components: string[]; message: string }[] =
  [
    {
      prop: 'size',
      components: ['Button', 'Text', 'Icon', 'Card', 'Stack', 'Badge'],
      message:
        '`size` is not a framework prop. Use `level` for Text, no size prop for Button/Card.',
    },
    {
      prop: 'tone',
      components: ['Button', 'Text', 'Badge', 'Alert'],
      message: '`tone` is not a framework prop. Use `variant` instead.',
    },
    {
      prop: 'color',
      components: ['Button', 'Text', 'Icon', 'Badge', 'Card'],
      message:
        '`color` is not a framework prop. Colors come from theme/variant, not inline props.',
    },
    {
      prop: 'padding',
      components: ['Card', 'Stack', 'Section', 'Box'],
      message:
        '`padding` is not a framework prop. Use `spacing` tokens or framework layout props.',
    },
    {
      prop: 'margin',
      components: ['Card', 'Stack', 'Section', 'Box', 'Button', 'Text'],
      message:
        '`margin` is not a framework prop. Use `gap` on parent Stack or layout spacing.',
    },
    {
      prop: 'spacing',
      components: ['Card', 'Section', 'Box'],
      message:
        '`spacing` is not a prop on this component. Use `gap` on Stack or framework layout.',
    },
    {
      prop: 'columns',
      components: ['DataTable', 'Grid', 'List'],
      message:
        '`columns` is not a framework prop. Check lookup_symbol for the correct prop name.',
    },
    {
      prop: 'background',
      components: ['Card', 'Section', 'Box', 'Stack'],
      message:
        '`background` is not a framework prop. Use `variant` or theme tokens.',
    },
    {
      prop: 'fields',
      components: ['Form', 'DataTable', 'Card'],
      message:
        '`fields` is not a framework prop. Check lookup_symbol for the correct prop name.',
    },
  ];

/** Tailwind utility class prefixes — detect className misuse */
const TAILWIND_PREFIXES = [
  'bg-',
  'text-',
  'p-',
  'px-',
  'py-',
  'pt-',
  'pb-',
  'pl-',
  'pr-',
  'ps-',
  'pe-',
  'm-',
  'mx-',
  'my-',
  'mt-',
  'mb-',
  'ml-',
  'mr-',
  'ms-',
  'me-',
  'flex',
  'grid',
  'w-',
  'h-',
  'min-w-',
  'min-h-',
  'max-w-',
  'max-h-',
  'gap-',
  'space-',
  'rounded-',
  'border-',
  'shadow-',
  'opacity-',
  'justify-',
  'items-',
  'self-',
  'overflow-',
  'z-',
];

/** Check a file for common convention violations */
export function checkFileConventions(filePath: string): string[] {
  const issues: string[] = [];
  if (!existsSync(filePath)) return [`File not found: ${filePath}`];

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const fileName = filePath.split('/').pop() || '';

  // Only check .tsx/.ts files
  if (!fileName.endsWith('.tsx') && !fileName.endsWith('.ts')) return [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNum = i + 1;

    // Inline styles — warn only, not a blocker.
    // Dynamic inline styles are valid for live previews, user-chosen colors, etc.
    // The line prefix "NOTE:" ensures it doesn't match the blocking regex ('- L').
    if (/style\s*=\s*\{\{/.test(line)) {
      issues.push(
        `NOTE L${lineNum}: Inline style found. Prefer className or framework utilities when possible.`
      );
    }

    // fontSize / font-size
    if (
      /fontSize|font-size/i.test(line) &&
      !/\/\/|\/\*|\*/.test(line.trimStart().substring(0, 2))
    ) {
      issues.push(
        `L${lineNum}: fontSize detected. Use Text level or Card title/subtitle props.`
      );
    }

    // textAlign left/right (should be start/end for RTL)
    if (
      /text-align:\s*(left|right)|textAlign:\s*['"]?(left|right)/i.test(line)
    ) {
      issues.push(
        `L${lineNum}: textAlign left/right detected. Use start/end for RTL support.`
      );
    }

    // require()
    if (
      /\brequire\s*\(/.test(line) &&
      !/\/\/|\/\*|\*/.test(line.trimStart().substring(0, 2))
    ) {
      issues.push(`L${lineNum}: require() found. Use ESM import.`);
    }

    // Manual date formatting
    if (
      /\.toLocaleDateString|\.toLocaleTimeString|new Intl\.DateTimeFormat/i.test(
        line
      )
    ) {
      issues.push(
        `L${lineNum}: Manual date formatting. Use formatDate() from @donotdev/core.`
      );
    }

    // Invalid size/gap tokens (Tailwind/Bootstrap conventions — not ours)
    // Only check files that import @donotdev components
    if (
      /@donotdev\//.test(content) &&
      /(?:gap|spacing|size)=["'](?:xs|sm|md|lg|xl|2xl)["']/.test(line)
    ) {
      issues.push(
        `L${lineNum}: Invalid size token. DoNotDev uses none/tight/medium/large — not xs/sm/md/lg/xl.`
      );
    }

    // --- New checks: only for .tsx files that import @donotdev, skip comment lines ---
    const isComment = /\/\/|\/\*|\*/.test(line.trimStart().substring(0, 2));
    if (
      fileName.endsWith('.tsx') &&
      /@donotdev\//.test(content) &&
      !isComment
    ) {
      // a) Native HTML element detection
      const htmlMatch = line.match(
        /<(div|span|p|h[1-6]|button|a|input|textarea|select|form|table|tr|td|th|ul|ol|li|img|section|nav|header|footer)[\s>\/]/
      );
      if (htmlMatch) {
        const tag = htmlMatch[1]!;
        issues.push(
          `L${lineNum}: Native <${tag}> detected. Use ${HTML_ALTERNATIVES[tag] ?? 'a framework component'} instead.`
        );
      }

      // b) Hallucinated prop detection — only flag when prop is on the SAME
      // JSX element as a framework component. Walk backwards from the prop line
      // to find the opening <Component that this prop belongs to.
      for (const denied of DENIED_PROPS) {
        const propPattern = new RegExp(`\\b${denied.prop}\\s*=`);
        if (propPattern.test(line)) {
          // Find the JSX element this prop belongs to by walking back to the opening <
          let ownerComponent: string | null = null;
          for (let j = i; j >= Math.max(0, i - 5); j--) {
            const openMatch = lines[j]!.match(/<([A-Z]\w+)\b/);
            if (openMatch) {
              ownerComponent = openMatch[1]!;
              break;
            }
          }
          // Only flag if the owner component is one of the denied targets
          if (ownerComponent && denied.components.includes(ownerComponent)) {
            issues.push(`L${lineNum}: ${denied.message}`);
          }
        }
      }

      // c) Tailwind className detection
      const classNameMatch = line.match(/className="([^"]+)"/);
      if (classNameMatch) {
        const classValue = classNameMatch[1]!;
        const tailwindHits = TAILWIND_PREFIXES.filter((prefix) =>
          classValue
            .split(/\s+/)
            .some(
              (cls) =>
                cls.startsWith(prefix) || cls === prefix.replace(/-$/, '')
            )
        );
        if (tailwindHits.length > 0) {
          issues.push(
            `L${lineNum}: Tailwind utility classes in className (${tailwindHits.join(', ')}). Use framework components and props instead.`
          );
        }
      }
    }
  }

  // Import order check (simplified)
  const importLines = lines
    .map((l, i) => ({ line: l, num: i + 1 }))
    .filter(({ line }) => /^import\s/.test(line));

  if (importLines.length > 1) {
    let lastCategory = 0;
    for (const { line, num } of importLines) {
      let category = 4; // relative
      if (/from\s+['"]react/.test(line)) category = 1;
      else if (/from\s+['"]@donotdev\//.test(line)) category = 3;
      else if (/from\s+['"][^.]/.test(line)) category = 2; // vendor

      if (category < lastCategory) {
        issues.push(
          `L${num}: Import order violation. Expected: React > vendors > @donotdev > relative.`
        );
        break;
      }
      lastCategory = category;
    }
  }

  return issues;
}

/** Scan a list of files for @donotdev component usage without prior lookup_symbol.
 *
 * ONLY checks components actually imported from @donotdev/* packages.
 * Skips: lucide-react icons, local components, TypeScript types/interfaces.
 */
export function checkSymbolUsage(
  files: string[],
  lookedUpSymbols: string[]
): string[] {
  const warnings: string[] = [];

  for (const filePath of files) {
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf-8');

    // Check if file imports from @donotdev
    if (!/@donotdev\//.test(content)) continue;

    // Extract ONLY symbols imported from @donotdev/* packages
    const donotdevImports = new Set<string>();
    const importPattern =
      /import\s+(?:type\s+)?{([^}]+)}\s+from\s+['"]@donotdev\/[^'"]+['"]/g;
    for (const importMatch of content.matchAll(importPattern)) {
      const symbols = importMatch[1]!.split(',').map((s) => s.trim());
      for (const sym of symbols) {
        // Handle "Foo as Bar" — track the original name
        const name = sym.split(/\s+as\s+/)[0]!.trim();
        if (name && /^[A-Z]/.test(name)) {
          donotdevImports.add(name);
        }
      }
    }

    // Only check components that are actually from @donotdev
    for (const componentName of donotdevImports) {
      if (
        !lookedUpSymbols.includes(componentName) &&
        !lookedUpSymbols.includes(`${componentName}Props`)
      ) {
        warnings.push(
          `${filePath}: <${componentName}> used but lookup_symbol("${componentName}") was never called. Props may be hallucinated.`
        );
      }
    }
  }

  return [...new Set(warnings)];
}

// ==========================================================================
// RUNTIME VALIDATION
// ==========================================================================

export function assertString(
  value: unknown,
  name: string
): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`Expected "${name}" to be a string, got ${typeof value}`);
  }
}

export function assertNumber(
  value: unknown,
  name: string
): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Expected "${name}" to be a number, got ${typeof value}`);
  }
}

export function assertBoolean(
  value: unknown,
  name: string
): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected "${name}" to be a boolean, got ${typeof value}`);
  }
}

export function assertStringArray(
  value: unknown,
  name: string
): asserts value is string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`Expected "${name}" to be a string array`);
  }
}
