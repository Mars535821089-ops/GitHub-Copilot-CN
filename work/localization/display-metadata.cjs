const reviewedMaps = require('./reviewed-display-maps.json');
const propName = node => node?.key?.name ?? node?.key?.value;
const literalText = node => node?.type === 'Literal' && typeof node.value === 'string'
  ? node.value : node?.type === 'TemplateLiteral' && !node.expressions.length
    ? node.quasis[0].value.cooked : null;
const displayProperty = key => /^[a-z][A-Za-z]*(?:Label|Title|Description|Placeholder|Tooltip|Caption|Hint|Text)$/.test(key)
  && !/(?:source|code|diff|input|output|message|original|user|repo|modelName)/i.test(key);

function mapValue(node) {
  if (node?.type === 'Literal' && node.value === null) return null;
  if (node?.type === 'Identifier') return {identifier: true};
  if (node?.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') return {member: node.property.name};
  if (node?.type === 'TemplateLiteral') return node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? '${' + i + '}' : '')).join('');
  return literalText(node) ?? undefined;
}

function reviewedMapValue(node, ancestors, fileName = '') {
  const property = ancestors.at(-2), owner = ancestors.at(-3);
  if (property?.type !== 'Property' || property.value !== node || owner?.type !== 'ObjectExpression') return false;
  const maps = Object.entries(reviewedMaps).filter(([prefix]) => fileName.startsWith(prefix)).flatMap(([, values]) => values);
  return maps.some(map => owner.properties.length === Object.keys(map).length
    && new Set(owner.properties.map(propName)).size === owner.properties.length
    && owner.properties.every(p => p.type === 'Property' && !p.computed && !p.method
      && Object.hasOwn(map, propName(p)) && JSON.stringify(mapValue(p.value)) === JSON.stringify(map[propName(p)])));
}

function toolDisplayValue(node, ancestors, fileName = '') {
  if (!fileName.startsWith('useWebSocketTransport-')) return false;
  const property = ancestors.at(-2), owner = ancestors.at(-3);
  if (property?.type !== 'Property' || property.value !== node || owner?.type !== 'ObjectExpression') return false;
  if (!['imperative', 'gerund', 'past', 'failed', 'connector'].includes(propName(property))) return false;
  return ['imperative', 'gerund', 'past'].every(key => owner.properties.some(p => propName(p) === key && literalText(p.value) !== null))
    && owner.properties.every(p => p.type === 'Property' && !p.computed && !p.method
      && ['imperative', 'gerund', 'past', 'failed', 'connector', 'subject', 'quoteSubject', 'hideArgPreview', 'agent', 'form'].includes(propName(p)));
}

function systemDisplayValue(node, fileName = '') {
  if (node?.type !== 'TemplateLiteral') return false;
  const text = node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? '${' + i + '}' : '')).join('');
  return fileName.startsWith('ReasoningProgress-') && text === 'Thought for ${0}s'
    || fileName.startsWith('WorkspaceHoverPreviewCard-') && text === '${0} (${1} sub-agent${2}, ${3} calls, ${4} hidden)'
    || fileName.startsWith('Conversation-') && [
      'Compacted conversation', 'Compacted conversation. Removed ${0}',
      'Compaction failed.', 'Compaction failed. ${0}', '~${0} tokens', '${0} message${1}',
    ].includes(text);
}

function tourErrorValue(node, ancestors, fileName = '') {
  if (!fileName.startsWith('PullRequestDetailView-')) return false;
  const property = ancestors.at(-2), owner = ancestors.at(-3);
  return property?.type === 'Property' && property.value === node && owner?.type === 'ObjectExpression'
    && owner.properties.length > 5 && owner.properties.every(p => p.type === 'Property'
      && !p.computed && /^(?:shared_tour|tour)_/.test(propName(p)) && literalText(p.value) !== null);
}

module.exports = {displayProperty, literalText, mapValue, reviewedMapValue, toolDisplayValue, systemDisplayValue, tourErrorValue};
