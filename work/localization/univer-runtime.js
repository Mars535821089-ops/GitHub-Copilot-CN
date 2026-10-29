// Official Univer locale data applies only to its UI resource registration, never to workbook contents.
(() => {
  const locale = __UNIVER_ZH_CN__;
  function merge(original, translated) {
    if (Array.isArray(translated)) return [...translated];
    if (!translated || typeof translated !== 'object') return translated;
    const result = {...original};
    for (const [key, value] of Object.entries(translated)) {
      result[key] = value && typeof value === 'object' && !Array.isArray(value)
        ? merge(original?.[key], value) : Array.isArray(value) ? [...value] : value;
    }
    return result;
  }
  globalThis.__copilotZhUniverLocale = original => merge(original, locale);
})();
