const path = require('path');
const { promisify } = require('util');
const fs = require('fs');
const readFile = promisify(fs.readFile.bind(fs));
const glob = promisify(require('glob'));
const joinSources = require('./join-sources');
const REGX_APPEND = /\/\/(\s+|)@(prepros-|codekit-|)append/;
const REGX_PREPEND = /\/\/(\s+|)@(prepros-|codekit-|)prepend/;

class Resolver {
  constructor(options) {
    this.file = options.file;
    this.code = options.code;
    this.parents = options.parents;
    this.baseDir = path.dirname(this.file);
    this.rootDir = options.rootDir || this.baseDir;
  }

  async exists(file) {
    const access = promisify(fs.access.bind(fs));
    return await access(file, fs.constants.F_OK)
      .then(()=> true)
      .catch(()=> false);
  }

  getMatches(regx) {
    let matches = [];
    for(const [index, code] of this.code.split('\n').entries()) {
      if(regx.test(code)) {
        matches = matches.concat(
          code
            .replace(regx, '') //Remove the @append/@prepend part
            .replace(/;|'|"/gi, '') //Remove any semicolons or quotes
            .split(',') //Split comma separated lists
            .filter(match=> !!match) //Remove empty items
            .map(match=> ({ match: match.trim(), line: index + 1 }))
        );
      }
    }
    return matches;
  }

  async resolveGlob(pattern) {
    let files = await glob(pattern, { cwd: this.baseDir, absolute: true });
    files = files.filter(file=> path.extname(file) === '.js'); //Only resolve js files
    if(!files.length) throw new Error(`Unable to find any files matching the pattern \`${pattern}\``);
    return files;
  }

  async _resolveMatch(match) {
    if(match.includes('*')) return await this.resolveGlob(match);
    const name = path.basename(match, '.js');
    const possibleNames = [`${name}.js`, `_${name}.js`]; //file.js or _file.js partial
    for(const name of possibleNames) {
      const filePath = path.resolve(this.baseDir, path.dirname(match), name);
      if(await this.exists(filePath)) return filePath;
    }
    throw new Error(`Unable to find the included file \`${match}\``);
  }

  //Resolve full path/paths of a match
  async resolveMatch({ match, line }) {
    let files = [];
    try {
      files = files.concat(await this._resolveMatch(match));

      //Throw an error if a file is including itself
      files.forEach(file=> {
        if(file === this.file) throw new Error(`\`${path.relative(this.rootDir, file)}\` can not be appended/prepended to itself`);
      });

      //Throw an error if a file is including a parent
      files.forEach(file=> {
        if(this.parents.includes(file)) throw new Error(`\`${path.relative(this.rootDir, this.file)}\` can not append/prepend the parent file \`${path.relative(this.rootDir, file)}\``);
      });

    } catch (err) {
      //Add line numbers on errors
      err.line = line;
      err.column = 1;
      err.file = this.file;
      throw err;
    }

    return files;
  }

  async _resolve(regx) {
    let result = [];
    const matches = this.getMatches(regx);
    for(const { match, line } of matches) {
      result = result.concat(await this.resolveMatch({ match, line }))
    }
    return result;
  }

  async resolve() {
    const [ prepends, appends ] = await Promise.all(
      [ REGX_PREPEND, REGX_APPEND ].map(regx=> this._resolve(regx))
    );
    return { prepends, appends };
  }
}

async function readCodeMap(file, readMap) {
  const code = await readFile(file, 'utf-8');
  if(!readMap) return { code };
  const map = await readFile(`${file}.map`, 'utf-8').catch(()=>{}); //ignore errors
  return { code, map };
}

async function getSources({ file, code, map, readMap, rootDir, parents }) {
  if(!file) throw new Error('`file` is required');
  if(typeof code !== 'string') throw new Error('`code` must be a string');
  if(!parents) parents = [];

  let sources = [];
  const children = await new Resolver({ file, code, rootDir, parents }).resolve();
  const childOptions = { readMap, rootDir, parents: parents.concat(file) }; //Add self to the parent of children files

  //Recursively read prepended sources
  for(const prepend of children.prepends) {
    const { code, map } = await readCodeMap(prepend, readMap);
    sources = sources.concat(await getSources({ file: prepend, code, map, ...childOptions }));
  }

  //Add self between prepends and appends
  sources = sources.concat({ file, code, map });

  //Recursively read appended sources
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
