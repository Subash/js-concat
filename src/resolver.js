import path from 'node:path';
import fs from 'node:fs/promises';

const REGX_APPEND = /\/\/(\s+|)@(prepros-|codekit-|)append/;
const REGX_PREPEND = /\/\/(\s+|)@(prepros-|codekit-|)prepend/;

export default class Resolver {
  constructor(options) {
    this.file = options.file;
    this.code = options.code;
    this.parents = options.parents;
    this.baseDir = path.dirname(this.file);
    this.rootDir = options.rootDir || this.baseDir;
  }

  async exists(file) {
    return await fs.access(file, fs.constants.F_OK)
      .then(()=> true)
      .catch(()=> false);
  }

  getMatches(regx) {
    let matches = [];
    for(const [index, code] of this.code.split('\n').entries()) {
      if(regx.test(code)) {
        matches = matches.concat(
          code
            .replace(regx, '') // remove the @append/@prepend part
            .replace(/;|'|"/gi, '') // remove all semicolons and quotes
            .split(',') // split comma separated lists
            .filter(match=> !!match) // remove empty items
            .map(match=> (
              match
                .trim()
                .replace(/^quiet\s+/, '') // remove leading quiet keyword for codekit compatibility
                .replace(/\s+quiet$/, '') // remove trailing quiet keyword for codekit compatibility
            ))
            .map(match=> ({ match: match.trim(), line: index + 1 }))
        );
      }
    }

    return matches;
  }

  async _resolveMatch(match) {
    const name = path.basename(match, '.js');
    const possibleNames = [`${name}.js`, `_${name}.js`]; // file.js or _file.js partial
    for(const name of possibleNames) {
      const filePath = path.resolve(this.baseDir, path.dirname(match), name);
      if(await this.exists(filePath)) return filePath;
    }
    throw new Error(`Unable to find the included file \`${match}\``);
  }

  // resolve full path/paths of a match
  async resolveMatch({ match, line }) {
    let files = [];
    try {
      files = files.concat(await this._resolveMatch(match));

      // throw an error if a file is including itself
      files.forEach(file=> {
        if(file === this.file) throw new Error(`\`${path.relative(this.rootDir, file)}\` can not be appended/prepended to itself`);
      });

      // throw an error if a file is including a parent
      files.forEach(file=> {
        if(this.parents.includes(file)) throw new Error(`\`${path.relative(this.rootDir, this.file)}\` can not append/prepend the parent file \`${path.relative(this.rootDir, file)}\``);
      });

    } catch (err) {
      // add line numbers on errors
      err.line = line;
      err.column = 1;
      err.file = this.file;
      throw err;
    }

    return files;
  }

  async resolve(regx) {
    let result = [];
    const matches = this.getMatches(regx);
    for(const { match, line } of matches) {
      result = result.concat(await this.resolveMatch({ match, line }))
    }
    return result;
  }

  async resolveAll() {
    const [ prepends, appends ] = await Promise.all(
      [ REGX_PREPEND, REGX_APPEND ].map(regx=> this.resolve(regx))
    );
    return { prepends, appends };
  }
}
