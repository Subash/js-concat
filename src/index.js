const { readFile } = require('node:fs/promises');
const Resolver = require('./resolver');
const joinSources = require('./join-sources');

async function readCodeMap(file, readMap) {
  const code = await readFile(file, 'utf-8');
  if(!readMap) return { code };
  const map = await readFile(`${file}.map`, 'utf-8').catch(()=>{}); // ignore errors
  return { code, map };
}

async function getSources({ file, code, map, readMap, rootDir, parents }) {
  if(!file) throw new Error('`file` is required');
  if(typeof code !== 'string') throw new Error('`code` must be a string');
  if(!parents) parents = [];

  let sources = [];
  const children = await new Resolver({ file, code, rootDir, parents }).resolveAll();
  const childOptions = { readMap, rootDir, parents: parents.concat(file) }; // add self to the parent of children files

  // recursively read prepended sources
  for(const prepend of children.prepends) {
    const { code, map } = await readCodeMap(prepend, readMap);
    sources = sources.concat(await getSources({ file: prepend, code, map, ...childOptions }));
  }

  // add self between prepends and appends
  sources = sources.concat({ file, code, map });

  // recursively read appended sources
  for(const append of children.appends) {
    const { code, map } = await readCodeMap(append, readMap);
    sources = sources.concat(await getSources({ file: append, code, map, ...childOptions }));
  }

  return sources;
}

module.exports = async function compile(code, options = {}) {
  const file = options.file;
  const map = options.inputSourceMap;
  const sourceMap = options.sourceMap || false;
  const rootDir = options.rootDir;
  const output = options.output;

  if(!output) throw new Error('`output` is required');

  const sources = await getSources({ file, code, map, rootDir, readMap: sourceMap });
  return await joinSources(sources, { output, sourceMap });
}
