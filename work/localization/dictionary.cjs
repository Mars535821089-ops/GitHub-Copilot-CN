const fs = require('node:fs');
const path = require('node:path');

function loadDictionary() {
  const read = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
  const base = read('dictionary.json');
  const native = read('native-dictionary.json');
  const reviewed = read('reviewed-dictionary.json');
  const emoji = read('emoji-dictionary.json');
  if (!Intl.DisplayNames.supportedLocalesOf(['zh-CN']).length) {
    throw new Error('Chinese ICU region names are required to build the emoji dictionary.');
  }
  const englishRegions = new Intl.DisplayNames(['en'], {type: 'region', fallback: 'none'});
  const chineseRegions = new Intl.DisplayNames(['zh-CN'], {type: 'region', fallback: 'none'});
  for (let first = 65; first <= 90; first++) {
    for (let second = 65; second <= 90; second++) {
      const code = String.fromCharCode(first, second);
      if (code === 'ZZ') continue;
      const english = englishRegions.of(code), chinese = chineseRegions.of(code);
      if (english && chinese) emoji['flag: ' + english] = chinese + '旗帜';
    }
  }
  const dictionary = {...base, ...emoji, ...native, ...reviewed};
  const reviewedTargets = new Set(Object.values(reviewed));
  // Repair older localized display strings without rewriting user content.
  for (const [source, target] of Object.entries(reviewed)) {
    const previous = base[source];
    if (previous && previous !== target && !reviewedTargets.has(previous) && !Object.hasOwn(dictionary, previous)) {
      dictionary[previous] = target;
    }
  }
  return dictionary;
}

module.exports = {loadDictionary};
if (require.main === module) process.stdout.write(JSON.stringify(loadDictionary()));
