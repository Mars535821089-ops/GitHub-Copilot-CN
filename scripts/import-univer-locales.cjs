const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {execFileSync} = require('node:child_process');
const acorn = require('../work/runtime/node_modules/acorn');
const version = '0.24.0';
const packages = ['preset-sheets-core', 'preset-sheets-conditional-formatting', 'preset-sheets-data-validation',
  'preset-sheets-drawing', 'preset-sheets-filter', 'preset-sheets-hyper-link', 'preset-sheets-note'];

function merge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe locale key: ' + key);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = merge(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
    } else target[key] = value;
  }
  return target;
}

function readStatic(node, bindings) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'TemplateLiteral' && !node.expressions.length) return node.quasis[0].value.cooked;
  if (node.type === 'Identifier' && bindings.has(node.name)) return bindings.get(node.name);
  if (node.type === 'ArrayExpression') return node.elements.map(value => readStatic(value, bindings));
  if (node.type === 'ObjectExpression') {
    const result = {};
    for (const p of node.properties) {
      if (p.type === 'SpreadElement') {
        const value = readStatic(p.argument, bindings);
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid static locale spread');
        merge(result, value); continue;
      }
      if (p.type !== 'Property' || p.computed || p.method || p.kind !== 'init') throw new Error('Non-data locale property: ' + p.type);
      const key = p.key.name ?? p.key.value;
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe locale key');
      result[key] = readStatic(p.value, bindings);
    }
    return result;
  }
  throw new Error('Locale source contains non-static data: ' + node.type);
}

function extractLocales(source) {
  const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'script'});
  const result = {};
  let count = 0;
  for (const statement of ast.body) {
    const factory = statement.type === 'ExpressionStatement' && statement.expression.type === 'CallExpression'
      ? statement.expression.arguments.at(-1) : null;
    if (factory?.type !== 'FunctionExpression') continue;
    // The final preset factory merges imports. Its preceding data-only factories are read instead.
    if (factory.params.length) continue;
    const bindings = new Map();
    for (const node of factory.body.body) {
      if (node.type === 'VariableDeclaration') for (const variable of node.declarations) {
        if (variable.id.type !== 'Identifier') throw new Error('Unexpected locale binding');
        bindings.set(variable.id.name, readStatic(variable.init, bindings));
      }
      else if (node.type === 'ReturnStatement') {
        const locale = readStatic(node.argument, bindings);
        if (!locale || typeof locale !== 'object' || Array.isArray(locale)) throw new Error('Invalid locale object');
        merge(result, locale); count++;
      } else throw new Error('Unexpected executable statement in locale factory');
    }
  }
  if (!count) throw new Error('No static locale factories found');
  return result;
}

async function download(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(60000)});
  if (!response.ok) throw new Error('Download failed: ' + response.status + ' ' + url);
  return Buffer.from(await response.arrayBuffer());
}

async function main() {
  const output = path.resolve(__dirname, '../work/localization/vendor/univer');
  const manifestPath = path.join(output, 'manifest.json');
  const pinned = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath)) : null;
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-univer-locales-'));
  const combined = {}, records = [];
  let license;
  const notices = [];
  try {
    for (const name of packages) {
      const packageName = '@univerjs/' + name;
      const metadata = JSON.parse((await download('https://registry.npmjs.org/' + packageName + '/' + version)).toString());
      if (metadata.version !== version || metadata.license !== 'Apache-2.0') throw new Error('Unexpected version/license: ' + packageName);
      const url = 'https://registry.npmjs.org/@univerjs/' + name + '/-/' + name + '-' + version + '.tgz';
      if (metadata.dist.tarball !== url || !metadata.dist.integrity.startsWith('sha512-')) throw new Error('Unexpected archive metadata');
      const previous = pinned?.packages.find(record => record.name === packageName);
      if (pinned && (!previous || previous.integrity !== metadata.dist.integrity)) throw new Error('Pinned archive integrity changed: ' + packageName);
      const archive = await download(url);
      const integrity = 'sha512-' + crypto.createHash('sha512').update(archive).digest('base64');
      if (integrity !== metadata.dist.integrity) throw new Error('Archive integrity mismatch: ' + packageName);
      const file = path.join(temporary, name + '.tgz');
      fs.writeFileSync(file, archive);
      const source = execFileSync('tar', ['-xOzf', file, 'package/lib/umd/locales/zh-CN.js'], {encoding: 'utf8', maxBuffer: 20 * 1024 * 1024});
      merge(combined, extractLocales(source));
      license ??= execFileSync('tar', ['-xOzf', file, 'package/LICENSE'], {encoding: 'utf8'});
      const entries = execFileSync('tar', ['-tzf', file], {encoding: 'utf8'}).split('\n');
      if (entries.includes('package/NOTICE')) notices.push(packageName + '\n' + execFileSync('tar', ['-xOzf', file, 'package/NOTICE'], {encoding: 'utf8'}));
      records.push({name: packageName, version, url, integrity, source: 'package/lib/umd/locales/zh-CN.js'});
    }
    fs.mkdirSync(output, {recursive: true});
    const data = JSON.stringify(combined, null, 2) + '\n';
    fs.writeFileSync(path.join(output, 'zh-CN.json'), data);
    fs.writeFileSync(path.join(output, 'LICENSE'), license);
    fs.writeFileSync(path.join(output, 'NOTICE'), 'Chinese locale data from Univer 0.24.0, copyright DreamNum Co., Ltd. and Univer contributors.\nLicensed under Apache-2.0. Locale objects are statically extracted and merged; no downloaded code is executed.\nSource packages and verified SHA-512 archive integrities are recorded in manifest.json.\n' + notices.join('\n'));
    fs.writeFileSync(manifestPath, JSON.stringify({version, license: 'Apache-2.0', localeSha256: crypto.createHash('sha256').update(data).digest('hex'), packages: records}, null, 2) + '\n');
    console.log(JSON.stringify({version, packages: records.length, localeSections: Object.keys(combined), output}, null, 2));
  } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
}

module.exports = {extractLocales};
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
