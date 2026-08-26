/**
 * Small constants shared across the enrichment pipeline.
 *
 * @packageDocumentation
 */

/**
 * The marker the indexer puts in front of an API path whose mount point could
 * not be resolved.
 *
 * Mirrored rather than imported because the indexer does not re-export it, and
 * duplicating one character is cheaper than widening that package's public API.
 * `packages/semantic/test/candidates.test.ts` pins the two together.
 */
export const UNKNOWN_API_PATH_PREFIX = '?';

/**
 * Version of the enrichment pipeline, recorded on everything it generates.
 *
 * It is the version of the *rules*, not of the package. Bump it whenever the
 * verification matrix, the universal checks or the prose gate change what would
 * be accepted, because {@link enrichApplicationGraph} refuses to reuse a stored
 * feature produced by a different version: a claim upheld by an older set of
 * rules has not been checked by this one, and carrying it forward would present
 * a check that never ran as one that passed.
 *
 * 2.1.0 added the subject-scope check, tied `route` and `permission` values to
 * the facts a claim cites, refused interpretations that cite nothing, and put
 * generated wording through the proposition gate.
 */
export const SEMANTIC_GENERATOR_VERSION = '2.1.0';
