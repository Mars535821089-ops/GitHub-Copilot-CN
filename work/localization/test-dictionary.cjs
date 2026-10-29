const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {JSDOM} = require('../runtime/node_modules/jsdom');
const {loadDictionary} = require('./dictionary.cjs');
const {localize} = require('./localize.cjs');
const {transform} = require('./ui-surface-pass.cjs');
const base = require('./dictionary.json');
const reviewed = require('./reviewed-dictionary.json');
const dictionary = loadDictionary();
const placeholders = text => [...text.matchAll(/\$\{(\d+)\}/g)].map(match => match[1]);

test('reviewed translations preserve interpolation slots and contain Chinese', () => {
  for (const [source, target] of Object.entries(reviewed)) {
    assert.match(target, /[\u3400-\u9fff]/, source);
    assert.deepEqual(placeholders(target), placeholders(source), source);
    assert.equal(dictionary[source], target);
  }
});

test('reviewed terminology is shared by static, runtime and native menu dictionaries', () => {
  for (const [source, target] of Object.entries({
    Tokens: '词元',
    Shell: '命令行',
    Worktrees: '工作树',
    'AI credits': 'AI 积分',
    'Go to Customize': '前往自定义',
    'Computer Use': '计算机操作',
    'Approve and implement with fleet': '批准并使用多智能体协作执行',
    'Check for Updates…': '检查更新…',
  })) assert.equal(dictionary[source], target);
});

test('emoji labels translate while shortcode and country-code spellings stay usable', () => {
  const emoji = require('./emoji-dictionary.json');
  for (const [source, target] of Object.entries(emoji)) {
    assert.match(target, /[\u3400-\u9fff]/, source);
    assert.equal(dictionary[source], target);
  }
  assert.equal(dictionary['flag: China'], '中国旗帜');
  assert.equal(dictionary['flag: Hong Kong SAR China'], '中国香港特别行政区旗帜');
  assert.equal(dictionary['flag: Japan'], '日本旗帜');
  assert.equal(dictionary['flag: United States'], '美国旗帜');
  const result = localize('const emoji={emoji:`👍`,names:[`+1`,`thumbsup`],tags:[`approve`],description:`thumbs up`,category:`People & Body`};', dictionary).code;
  assert.match(result, /description:[`"]赞[`"]/);
  assert.match(result, /names:\[`\+1`,`thumbsup`\]/);
  assert.match(result, /tags:\[`approve`\]/);
  assert.match(result, /category:`People & Body`/);
});

test('emoji descriptions translate even when their spelling is also used as a protocol sentinel', () => {
  const source = 'const item={emoji:`🧒`,names:[`child`],tags:[`person`],description:`child`,category:`People & Body`};function isChild(type){return type===`child`}';
  const result = localize(source, dictionary).code;
  assert.match(result, /description:[`"]儿童[`"]/);
  assert.match(result, /type===`child`/);
  assert.match(result, /names:\[`child`\]/);
  assert.match(result, /tags:\[`person`\]/);
  assert.match(result, /category:`People & Body`/);
  const ordinary = 'const item={description:`child`};function isChild(type){return type===`child`}';
  assert.equal(localize(ordinary, dictionary).code, ordinary);
});

test('older mixed-language translations are corrected at the display boundary', () => {
  const dom = new JSDOM('<body></body>', {runScripts: 'dangerously'});
  try {
    dom.window.eval(fs.readFileSync(__dirname + '/ui-runtime.js', 'utf8')
      .replace('__ZH_DICTIONARY__', () => JSON.stringify(dictionary)));
    for (const [source, target] of Object.entries(reviewed)) {
      assert.equal(dom.window.__copilotZhText(source), target, source);
      if (base[source] && base[source] !== target && !Object.hasOwn(base, base[source])) {
        assert.equal(dom.window.__copilotZhText(base[source]), target, source);
      }
    }
  } finally {
    dom.window.close();
  }
});

test('reviewed labels translate without changing mode IDs, callbacks, or user content', () => {
  const source = 'const item={label:`Approve and implement with fleet`,value:`fleet`,onClick:()=>start(`fleet`)};const user={content:`Shell`,prompt:`Tokens`};';
  const result = localize(source, dictionary).code;
  assert.match(result, /label:[`"]批准并使用多智能体协作执行[`"]/);
  assert.match(result, /value:`fleet`/);
  assert.match(result, /start\(`fleet`\)/);
  assert.match(result, /content:`Shell`,prompt:`Tokens`/);
});

test('already-localized display fragments are repaired without changing protocol enums', () => {
  const source = 'const rows=[[`fleet`,`使用 fleet 实施`]].map(([id,label])=>R.jsx(`button`,{value:id,children:label}));';
  const {code} = transform(source, dictionary);
  const rows = vm.runInNewContext(code + ';rows', {
    R: {jsx: (type, props) => ({type, props})},
    globalThis: {__copilotZhNode: value => dictionary[value] ?? value},
  });
  assert.equal(rows[0].props.value, 'fleet');
  assert.equal(rows[0].props.children, '使用多智能体协作执行');
});
