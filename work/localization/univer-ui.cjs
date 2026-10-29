const acorn = require('../runtime/node_modules/acorn');
const walk = require('../runtime/node_modules/acorn-walk');
const expectedLocale = 'wu(Fft,_ut,zmt,n_t,Dvt,yft,yyt,Hyt)';

function localizeUniver(source) {
  const ast = acorn.parse(source, {ecmaVersion: 'latest', sourceType: 'module'});
  const targets = [];
  walk.simple(ast, {Property(node) {
    if ((node.key.name ?? node.key.value) !== 'locales' || node.value.type !== 'ObjectExpression') return;
    const properties = node.value.properties;
    if (properties.length !== 1) return;
    const property = properties[0];
    if (!property.computed || source.slice(property.key.start, property.key.end) !== 'Bc.EN_US') return;
    if (source.slice(property.value.start, property.value.end) !== expectedLocale) return;
    targets.push(property.value);
  }});
  if (targets.length !== 1) throw new Error('Unrecognized Univer locale registration; refusing an incomplete spreadsheet localization.');
  const target = targets[0];
  return source.slice(0, target.start)
    + '((globalThis.__copilotZhUniverLocale??(v=>v))((' + expectedLocale + ')))'
    + source.slice(target.end);
}

module.exports = {localizeUniver};
