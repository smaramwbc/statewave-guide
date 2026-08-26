import { useMemo, useState } from 'react';
import { useGuide } from '@statewavedev/guide-react';
import { graphQuery } from './application-graph';
import type { ApplicationNode, Evidence, PathStep } from './application-graph';

/** Relationship label shown between two nodes in the behaviour chain. */
const RELATIONSHIP_LABEL: Record<string, string> = {
  invokes: 'invokes',
  opens: 'opens',
  renders: 'renders',
  contains: 'contains',
  submits_to: 'submits_to',
  calls: 'calls',
  uses_service: 'uses_service',
  calls_api: 'calls_api',
  navigates_to: 'navigates_to',
};

/** A node's display name — the readable half of its canonical id. */
function nodeLabel(id: string, node: ApplicationNode | undefined): string {
  if (!node) return id;
  switch (node.kind) {
    case 'api':
      return `${node.method} ${node.path}`;
    case 'element':
      return node.elementId;
    case 'route':
      return node.path;
    case 'component':
    case 'function':
    case 'service':
    case 'hook':
    case 'schema':
      return node.name;
    case 'permission':
      return node.permission;
    default:
      return id;
  }
}

function EvidenceList({ evidence }: { evidence: readonly Evidence[] }) {
  return (
    <ul className="inspector__evidence">
      {evidence.map((item, index) => (
        <li key={`${item.file}:${item.line}:${index}`}>
          <span className="inspector__where">
            {item.file}:{item.line}
          </span>
          {item.rule && <span className="inspector__rule">rule: {item.rule}</span>}
          {item.excerpt && <code>{item.excerpt}</code>}
        </li>
      ))}
    </ul>
  );
}

function Hop({ step }: { step: PathStep }) {
  const [open, setOpen] = useState(false);
  const target = graphQuery.getNode(step.target);

  return (
    <li className="inspector__hop">
      <button className="inspector__hop-line" onClick={() => setOpen((value) => !value)}>
        <span className="inspector__arrow">↓</span>
        <span className="inspector__rel">
          {RELATIONSHIP_LABEL[step.relationship] ?? step.relationship}
        </span>
        <span className="inspector__target">{nodeLabel(step.target, target)}</span>
        <span className="inspector__confidence">{step.confidence}</span>
      </button>
      {open && <EvidenceList evidence={step.evidence} />}
    </li>
  );
}

/**
 * The Inspector.
 *
 * Two sources of truth, deliberately shown side by side:
 *
 * - **SOURCE / ROUTE / BEHAVIOUR** come from the committed application graph —
 *   what the indexer proved from source, offline, with evidence.
 * - **LIVE RUNTIME** comes from the React element registry — what is actually
 *   mounted and visible in this browser tab right now.
 *
 * Neither substitutes for the other, and disagreement between them is itself
 * information.
 */
export function Inspector() {
  const { elements, highlightElement } = useGuide();
  const [selected, setSelected] = useState('clients.create');

  const feature = useMemo(() => graphQuery.resolveFeaturePath(selected), [selected]);
  const element = graphQuery.getNode(`element:${selected}`);
  const live = elements.find((candidate) => candidate.id === selected);

  const indexedIds = graphQuery
    .nodesOfKind('element')
    .map((node) => node.elementId)
    .sort();

  return (
    <div className="inspector">
      <h4>Statewave Guide Inspector</h4>

      <select
        className="inspector__select"
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
      >
        {indexedIds.map((id) => (
          <option key={id} value={id}>
            {id}
          </option>
        ))}
      </select>

      <section className="inspector__section">
        <h5>Source</h5>
        {element ? (
          <code>
            {element.provenance.file}:{element.provenance.line}
          </code>
        ) : (
          <span className="inspector__gap">not in the application graph</span>
        )}
      </section>

      <section className="inspector__section">
        <h5>Route</h5>
        <code>{feature.routes.length > 0 ? feature.routes.join(', ') : '—'}</code>
        {feature.container && (
          <div className="inspector__muted">
            in {nodeLabel(feature.container, graphQuery.getNode(feature.container))}
          </div>
        )}
      </section>

      <section className="inspector__section">
        <h5>Live runtime</h5>
        {live ? (
          <span>
            {live.mounted ? 'mounted' : 'not mounted'} · {live.visible ? 'visible' : 'not visible'}
          </span>
        ) : (
          <span className="inspector__gap">not registered in this tab</span>
        )}
        <button className="inspector__highlight" onClick={() => void highlightElement(selected)}>
          Highlight
        </button>
      </section>

      {feature.permissions.length > 0 && (
        <section className="inspector__section">
          <h5>Permissions</h5>
          <code>{feature.permissions.join(', ')}</code>
        </section>
      )}

      <section className="inspector__section">
        <h5>Behaviour</h5>
        {feature.path.length === 0 ? (
          <div className="inspector__gap">No behaviour proven from this element.</div>
        ) : (
          <ol className="inspector__chain">
            <li className="inspector__start">{selected}</li>
            {feature.path.map((step) => (
              <Hop key={`${step.source}|${step.relationship}|${step.target}`} step={step} />
            ))}
          </ol>
        )}

        {/*
          The gap is a result, not a failure. Showing where the chain stopped —
          and which diagnostics were recorded in that file — is the difference
          between a graph you can trust and one you cannot.
        */}
        <div className="inspector__stop">
          chain ended: <strong>{feature.gap.reason.replace(/-/g, ' ')}</strong>
          {feature.gap.relatedDiagnostics.length > 0 && (
            <ul className="inspector__diagnostics">
              {feature.gap.relatedDiagnostics.slice(0, 4).map((diagnostic, index) => (
                <li key={index}>
                  <span className="inspector__code">{diagnostic.code}</span>
                  {diagnostic.line ? ` line ${diagnostic.line}` : ''}
                  {diagnostic.excerpt ? ` — ${diagnostic.excerpt}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
