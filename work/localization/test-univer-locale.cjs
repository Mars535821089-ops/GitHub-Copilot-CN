const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {extractLocales} = require('../../scripts/import-univer-locales.cjs');
const {localizeUniver} = require('./univer-ui.cjs');
const locale = require('./vendor/univer/zh-CN.json');
const runtime = fs.readFileSync(__dirname + '/univer-runtime.js', 'utf8');

test('official locale importer reads static data without executing package code', () => {
  const source = '(function(factory){})(function(){const base={label:`中文`};return {ui:{...base,days:[`日`,`一`]}}});';
  assert.deepEqual(extractLocales(source), {ui: {label: '中文', days: ['日', '一']}});
  assert.throws(() => extractLocales('(function(factory){})(function(){return runCode()});'), /non-static data/);
  assert.throws(() => extractLocales('(function(factory){})(function(){return {__proto__:{polluted:true}}});'), /Unsafe locale key/);
});

test('official spreadsheet locale covers toolbar, validation, filtering, drawings, links, notes, and formula help', () => {
  for (const key of ['toolbar', 'formula', 'sheet', 'dataValidation', 'image-panel', 'sheets-filter', 'hyperLink', 'note']) {
    assert.ok(locale[key], key);
    assert.match(JSON.stringify(locale[key]), /[\u3400-\u9fff]/, key);
  }
  assert.equal(locale.toolbar.undo, '撤销');
  assert.equal(locale.toolbar.redo, '重做');
  assert.equal(require('./vendor/univer/manifest.json').packages.length, 7);
  assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(__dirname+'/vendor/univer/zh-CN.json')).digest('hex'),
    require('./vendor/univer/manifest.json').localeSha256);
});

test('locale boundary preserves original workbook data, locale enum, and evaluates registration once', () => {
  const runtimeContext = {};
  vm.runInNewContext(runtime.replace('__UNIVER_ZH_CN__', () => JSON.stringify(locale)), runtimeContext);
  const original = {toolbar: {undo: 'Undo'}, custom: {unchanged: 'value'}};
  const before = JSON.stringify(original);
  const translated = runtimeContext.__copilotZhUniverLocale(original);
  assert.equal(translated.toolbar.undo, '撤销');
  assert.equal(translated.custom.unchanged, 'value');
  assert.equal(JSON.stringify(original), before);
  const source = 'const options={locale:Bc.EN_US,locales:{[Bc.EN_US]:wu(Fft,_ut,zmt,n_t,Dvt,yft,yyt,Hyt)}};options';
  let calls = 0;
  const context = {...runtimeContext, Bc: {EN_US: 'enUS'}, wu: () => {calls++; return original;}};
  for (const key of ['Fft', '_ut', 'zmt', 'n_t', 'Dvt', 'yft', 'yyt', 'Hyt']) context[key] = {};
  const output = vm.runInNewContext(localizeUniver(source), context);
  assert.equal(output.locale, 'enUS');
  assert.equal(output.locales.enUS.toolbar.undo, '撤销');
  assert.equal(calls, 1);
});

test('unknown or duplicate spreadsheet locale registration fails closed', () => {
  assert.throws(() => localizeUniver('const options={locales:{}};'), /Unrecognized Univer/);
  const source = 'const options={locales:{[Bc.EN_US]:wu(Fft,_ut,zmt,n_t,Dvt,yft,yyt,Hyt)}};';
  assert.throws(() => localizeUniver(source + source.replace('options', 'other')), /Unrecognized Univer/);
});
