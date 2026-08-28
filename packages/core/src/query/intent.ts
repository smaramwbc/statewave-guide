/**
 * Which of six things a question is asking for.
 *
 * Deterministic and model-free, because the whole contract has to work without
 * one. A provider may replace this classifier and will usually do it better; it
 * cannot replace the taxonomy, and it cannot reach past classification into
 * what the answer says.
 *
 * The ordering below is the rule: `SHOW_ME` is tested before `HOW_TO` because
 * *"Show me how to filter clients"* is both, and the more specific reading is
 * the one that produces actions rather than prose.
 *
 * @packageDocumentation
 */

import type { GuideQueryIntent } from './contract.js';

const PATTERNS: readonly { intent: GuideQueryIntent; test: RegExp }[] = [
  { intent: 'SHOW_ME', test: /^\s*(show|point|take)\s+me\b/i },
  { intent: 'SHOW_ME', test: /\b(highlight|show me where)\b/i },
  { intent: 'WHY_UNAVAILABLE', test: /\bwhy\s+(can'?t|cannot|is|are|does|do)\b/i },
  { intent: 'WHY_UNAVAILABLE', test: /\b(greyed|grayed)\s+out\b/i },
  { intent: 'WHERE_IS', test: /\bwhere\s+(is|are|do i find|can i find)\b/i },
  { intent: 'WHERE_IS', test: /\bfind\s+the\b/i },
  { intent: 'HOW_TO', test: /\bhow\s+(do|can|would)\s+i\b/i },
  { intent: 'HOW_TO', test: /^\s*how\s+to\b/i },
  { intent: 'EXPLAIN', test: /\bwhat\s+(does|is|are)\b/i },
  { intent: 'EXPLAIN', test: /^\s*explain\b/i },
];

/**
 * The intent of a question, or `UNKNOWN`.
 *
 * `UNKNOWN` is a real answer and not a failure. A question this cannot place is
 * one the system should say it cannot help with, and the alternative — picking
 * the closest intent and answering confidently — is how a guide starts inventing
 * things.
 */
export function classifyIntent(query: string): GuideQueryIntent {
  for (const pattern of PATTERNS) {
    if (pattern.test.test(query)) return pattern.intent;
  }
  return 'UNKNOWN';
}
