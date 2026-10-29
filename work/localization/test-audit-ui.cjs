const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {auditUi} = require('./audit-ui.cjs');
const {localize} = require('./localize.cjs');
const {loadDictionary} = require('./dictionary.cjs');
const {JSDOM} = require('../runtime/node_modules/jsdom');
const maps = require('./reviewed-display-maps.json');
const dictionary = loadDictionary();

function mapSource(map) {
  const entries = Object.entries(map).map(([key, value]) => {
    let source = JSON.stringify(value);
    if (value?.identifier) source = 'initializing';
    else if (value?.member) source = 'reference.' + value.member;
    else if (typeof value === 'string' && value.includes('${0}')) source = '`' + value.replace('${0}', '${reference.label}') + '`';
    return JSON.stringify(key) + ':' + source;
  });
  return 'const record={' + entries.join(',') + '};record';
}

test('all reviewed maps translate values but retain keys, references, and protocol IDs', () => {
  for (const [prefix, records] of Object.entries(maps)) for (const record of records) {
    const source = mapSource(record);
    const translated = localize(source, dictionary, {
      fileName: prefix + 'fixture.js', protectedStrings: Object.values(record).filter(v => typeof v === 'string'),
    }).code;
    const context = {initializing: 'untouched', reference: {label: 'reference label', description: 'reference description'}};
    const before = vm.runInNewContext(source, {...context});
    const after = vm.runInNewContext(translated, {...context});
    assert.deepEqual(Object.keys(after), Object.keys(before), prefix);
    for (const [key, value] of Object.entries(record)) {
      if (typeof value !== 'string') assert.equal(after[key], before[key], prefix + ':' + key);
      else if (value.includes('${0}')) assert.equal(after[key], (dictionary[value] ?? value).replace('${0}', context.reference.label), prefix + ':' + key);
      else assert.equal(after[key], dictionary[value] ?? value, prefix + ':' + key);
    }
  }
});

test('unreviewed map modules and changed source shapes cannot bypass sentinel protection', () => {
  const source = 'const record={off:`Disabled`,export:`View only`,on:`Remote control`};record';
  const protectedStrings = ['Disabled', 'View only', 'Remote control'];
  assert.equal(localize(source, dictionary, {fileName: 'user-module.js', protectedStrings}).code, source);
  const changed = source.replace('on:`Remote control`', 'on:`Remote control`,protocol:`on`');
  assert.equal(localize(changed, dictionary, {fileName: 'SessionsSettingsView-fixture.js', protectedStrings}).code, changed);
});

test('tool display verbs and metadata labels never alter tool IDs, statuses, or search keywords', () => {
  const source = 'const display={imperative:`Run SQL`,gerund:`Running SQL`,past:`Ran SQL`,subject:v=>v,hideArgPreview:true};const action={id:`read_file`,status:`failed`,stateLabel:`Open`};const keywords={FileText:[`file`,`document`],NotebookText:[`file`]};({display,action,keywords})';
  const output = vm.runInNewContext(localize(source, dictionary, {fileName: 'useWebSocketTransport-fixture.js', protectedStrings: ['Open']}).code);
  for (const key of ['imperative','gerund','past']) assert.match(output.display[key], /[\u3400-\u9fff]/);
  assert.equal(output.display.subject('untouched'), 'untouched');
  assert.equal(output.display.hideArgPreview, true);
  assert.equal(output.action.id, 'read_file');
  assert.equal(output.action.status, 'failed');
  assert.match(output.action.stateLabel, /[\u3400-\u9fff]/);
  assert.deepEqual(Array.from(output.keywords.FileText), ['file', 'document']);
  assert.deepEqual(Array.from(output.keywords.NotebookText), ['file']);
});

test('system event templates translate counts while preserving model and user messages', () => {
  const dom = new JSDOM('<body></body>', {runScripts: 'dangerously'});
  try {
    dom.window.eval(fs.readFileSync(__dirname + '/ui-runtime.js', 'utf8').replace('__ZH_DICTIONARY__', () => JSON.stringify(dictionary)));
    const source = 'function event(e){const n=e.count;return [`Compacted conversation. Removed ${e.details}`,`${n} message${n===1?``:`s`}`,`~${e.tokens} tokens`,`Compaction failed. ${e.error}`]}';
    const translated = localize(source, dictionary, {fileName: 'Conversation-fixture.js'}).code;
    const event = vm.runInNewContext(translated + ';event', {globalThis: dom.window});
    for (const count of [1, 2]) {
      const output = event({count, details: 'details', tokens: '174k', error: 'Original error'});
      assert.equal(output[0], '已压缩对话，已移除 details');
      assert.equal(output[1], count + ' 条消息');
      assert.equal(output[2], '约 174k 个词元');
      assert.equal(output[3], '压缩对话失败。Original error');
    }
    const reasoning = 'function event(seconds){return `Thought for ${seconds}s`}';
    assert.equal(vm.runInNewContext(localize(reasoning, dictionary, {fileName: 'ReasoningProgress-fixture.js'}).code + ';event(36)'), '思考了 36 秒');
    const user = 'const message={content:`Thought for ${seconds}s`};';
    assert.equal(localize(user, dictionary, {fileName: 'untrusted.js'}).code, user);
    const hover='function summary(name,count){return `${name} (${count} sub-agent${count===1?``:`s`}, ${3} calls, ${4} hidden)`}';
    const summary=vm.runInNewContext(localize(hover,dictionary,{fileName:'WorkspaceHoverPreviewCard-fixture.js'}).code+';summary',{globalThis:dom.window});
    for(const count of [1,2])assert.equal(summary('Original session name',count),'Original session name（'+count+' 个子智能体，3 次调用，4 项已隐藏）');
  } finally { dom.window.close(); }
});

test('full audit rejects untranslated maps, reports parse errors and accepts reviewed translations', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-ui-audit-'));
  try {
    const input = path.join(root, 'source'), output = path.join(root, 'translated');
    fs.mkdirSync(input); fs.mkdirSync(output);
    const map = {off: 'Disabled', export: 'View only', on: 'Remote control'};
    const source = mapSource(map), file = 'SessionsSettingsView-fixture.js', registry = {'SessionsSettingsView-': [map]};
    fs.writeFileSync(path.join(input, file), source);
    assert.equal(auditUi(input, output, dictionary, registry).passed, false);
    fs.writeFileSync(path.join(output, file), localize(source, dictionary, {fileName: file}).code);
    const report = auditUi(input, output, dictionary, registry);
    assert.equal(report.passed, true, JSON.stringify(report));
    assert.equal(report.modules, 1);
    assert.equal(report.verifiedMaps, 1);
    fs.writeFileSync(path.join(input, 'broken.js'), 'export {');
    assert.equal(auditUi(input, output, dictionary, registry).errors.length, 1);
    assert.equal(auditUi(input, output, dictionary, {'missing-': [map]}).passed, false);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
