const fs = require('node:fs');
const path = require('node:path');
const acorn = require('../runtime/node_modules/acorn');
const walk = require('../runtime/node_modules/acorn-walk');
const {localize, collectSentinels, displayContext} = require('./localize.cjs');
const {literalText, mapValue} = require('./display-metadata.cjs');
const reviewedMaps = require('./reviewed-display-maps.json');
const parse = source => acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
const chinese = text => /[\u3400-\u9fff]/.test(text);
const retainedNames = new Set(['Dependabot', 'WSL', 'SSH']);

function literalMaps(ast) {
  const maps = [];
  walk.simple(ast, {ObjectExpression(node) {
    if (!node.properties.every(p => p.type === 'Property' && !p.computed && !p.method && mapValue(p.value) !== undefined)) return;
    const entries = node.properties.map(p => [p.key.name ?? p.key.value, mapValue(p.value)]);
    if (new Set(entries.map(([key]) => key)).size !== entries.length) return;
    maps.push(Object.fromEntries(entries));
  }});
  return maps;
}

function sameMap(actual, expected) {
  return Object.keys(actual).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, value]) => Object.hasOwn(actual, key) && JSON.stringify(actual[key]) === JSON.stringify(value));
}

function auditUi(input, translated, dictionary, registry = reviewedMaps) {
  const files = fs.readdirSync(input).filter(file => file.endsWith('.js')).sort();
  if (!files.length) throw new Error('No JavaScript modules found; refusing an empty UI audit.');
  const report = {modules: files.length, translatedModules: 0, reviewedMaps: 0,
    verifiedMaps: 0, runtimeBoundaries: 0, univerLocaleBoundaries: 0, errors: [], missingMaps: [],
    missingTranslations: [], remainingEdits: [], englishCandidates: [], lookupCandidates: []};
  const sources = new Map(), sentinels = new Set();
  for (const file of files) {
    const source = fs.readFileSync(path.join(input, file), 'utf8');
    try {
      const ast = parse(source);
      for (const value of collectSentinels(ast)) sentinels.add(value);
      sources.set(file, {source, ast, maps: literalMaps(ast)});
    } catch (error) {
      report.errors.push({file, phase: 'original', error: error.message});
    }
  }
  const finalMaps = new Map();
  for (const [file, original] of sources) {
    const target = path.join(translated, file);
    const source = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : original.source;
    if (fs.existsSync(target)) report.translatedModules++;
    try {
      const ast = parse(source);
      const maps = literalMaps(ast);
      finalMaps.set(file, maps);
      if (file.startsWith('UniverWorkbookCanvas-')) {
        let boundaries = 0;
        walk.simple(ast, {CallExpression(node) {
          if (source.slice(node.callee.start, node.callee.end).includes('globalThis.__copilotZhUniverLocale')) boundaries++;
        }});
        report.univerLocaleBoundaries += boundaries;
        if (boundaries !== 1) report.remainingEdits.push({file, reason: 'Official Chinese spreadsheet locale boundary is missing or duplicated'});
      }
      const pending = localize(source, dictionary, {protectedStrings: sentinels, fileName: file});
      for (const edit of pending.edits) report.remainingEdits.push({file, text: edit.from, translation: edit.to});
      walk.fullAncestor(ast, (node, state, ancestors) => {
        if (node.type === 'CallExpression' && source.slice(node.callee.start, node.callee.end).includes('globalThis.__copilotZh')) report.runtimeBoundaries++;
        const text = node.type === 'TemplateLiteral' ? mapValue(node) : literalText(node);
        if (!text || chinese(text) || !/[A-Za-z]{2}/.test(text) || !displayContext(node, ancestors)) return;
        if (dictionary[text] && dictionary[text] !== text) return;
        const category = file.startsWith('UniverWorkbookCanvas-') ? 'spreadsheet-original-locale-or-internals'
          : /^(vendor-|dist-|rehype-|katex-|markdown-toolbar-|leva\.)/.test(file) ? 'third-party-ui-or-diagnostic'
            : /^https?:|^\.?\/?[.~]|^[A-Za-z_]+(?:\.[A-Za-z_]+)+$/.test(text) ? 'technical-example-or-path'
              : 'manual-review';
        report.englishCandidates.push({file, text, category, position: node.start,
          context: source.slice(Math.max(0, node.start - 70), node.end + 70)});
      });
      for (const map of maps) {
        const values = Object.values(map).filter(value => typeof value === 'string');
        if (values.length < 2 || values.length > 40) continue;
        if (values.filter(value => !chinese(value) && dictionary[value] && chinese(dictionary[value])).length < 2) continue;
        report.lookupCandidates.push({file, values: map});
      }
    } catch (error) {
      report.errors.push({file, phase: 'translated', error: error.message});
    }
  }
  for (const [prefix, maps] of Object.entries(registry)) {
    const modules = [...sources].filter(([file]) => file.startsWith(prefix));
    for (const map of maps) {
      report.reviewedMaps++;
      const originals = modules.filter(([, value]) => value.maps.some(actual => sameMap(actual, map)));
      if (!originals.length) {
        report.missingMaps.push({modulePrefix: prefix, keys: Object.keys(map)});
        continue;
      }
      const expected = Object.fromEntries(Object.entries(map).map(([key, value]) => {
        if (typeof value === 'string' && /[A-Za-z]/.test(value) && !chinese(value) && !retainedNames.has(value) && !chinese(dictionary[value] ?? '')) {
          report.missingTranslations.push({modulePrefix: prefix, key, text: value});
        }
        return [key, typeof value === 'string' ? dictionary[value] ?? value : value];
      }));
      for (const [file] of originals) {
        if (!finalMaps.get(file)?.some(actual => sameMap(actual, expected))) {
          report.remainingEdits.push({file, mapKeys: Object.keys(map), reason: 'Reviewed display map is not fully localized'});
        } else report.verifiedMaps++;
      }
    }
  }
  report.passed = ![report.errors, report.missingMaps, report.missingTranslations, report.remainingEdits].some(rows => rows.length);
  return report;
}

module.exports = {auditUi};
if (require.main === module) {
  const [input, translated, output] = process.argv.slice(2);
  if (!input || !translated || !output) throw new Error('Usage: node audit-ui.cjs SOURCE_ASSETS TRANSLATED_ASSETS REPORT.json');
  const report = auditUi(input, translated, require('./dictionary.cjs').loadDictionary());
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({...report, englishCandidates: report.englishCandidates.length,
    lookupCandidates: report.lookupCandidates.length}, null, 2));
  if (!report.passed) process.exitCode = 1;
}
