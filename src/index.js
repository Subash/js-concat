const { SourceMapConsumer, SourceNode } = require('source-map');
const path = require('path');
const { promisify } = require('util');
const fs = require('fs');
const glob = promisify(require('glob'));
const REGX_APPEND = /\/\/(\s+|)@(prepros-|codekit-|)append/;
const REGX_PREPEND = /\/\/(\s+|)@(prepros-|codekit-|)prepend/;
const REGX_SOURCEMAP = /\/\/(\s+|)[@#](\s+|)sourceMappingURL=/;

class JSConcat {
  constructor(options) {
    this.file = options.file || this.throwError('`file` is required');
    this.output = options.output || this.throwError('`output` is required');
    this.code = options.code || '';
    this.sourceMap = options.sourceMap;
    this.inputSourceMap = options.inputSourceMap;
    this.baseDir = options.baseDir || path.dirname(this.file);
    this.rootDir = options.rootDir || this.baseDir;
    this.parents = options.parents || [];
  }

  throwError(message) {
    throw new Error(message);
  }

  async exists(file) {
    const access = promisify(fs.access.bind(fs));
    return await access(file, fs.constants.F_OK)
      .then(()=> true)
      .catch(()=> false);
  }

  getMatchingFiles(regx) {
    let files = [];
    for(const [index, code] of this.code.split('\n').entries()) {
      if(regx.test(code)) {
        files = files.concat(
          code
            .replace(regx, '') //Remove the @append/@prepend part
            .replace(/;|'|"/gi, '') //Remove any semicolons or quotes
            .split(',') //Split comma separated lists
            .filter(file=> !!file) //Remove empty items
            .map(file=> ({ file: file.trim(), line: index + 1 }))
        );
      }
    }
    return files;
  }

  async resolveGlob(pattern) {
    let files = await glob(pattern, { cwd: this.baseDir, absolute: true });
    files = files.filter(file=> path.extname(file) === '.js'); //Only resolve js files
    if(!files.length) throw new Error(`Unable to find any files matching the pattern \`${pattern}\``);
    return files;
  }

  async _resolveFile(file) {
    if(file.includes('*')) return await this.resolveGlob(file);
    const name = path.basename(file, '.js');
    const possibleNames = [`${name}.js`, `_${name}.js`]; //file.js or _file.js partial
    for(const name of possibleNames) {
      const filePath = path.resolve(this.baseDir, path.dirname(file), name);
      if(await this.exists(filePath)) return filePath;
    }
    throw new Error(`Unable to find the included file \`${file}\``);
  }

  //Resolve real path of an included file
  //Can be multiple in case of a glob
  async resolveFile({ file, line }) {
    let files;
    try {
      files = [].concat(await this._resolveFile(file));

      //Throw an error if a file is including itself
      files.forEach(file=> {
        if(file === this.file) throw new Error(`\`${path.relative(this.rootDir, file)}\` can not be appended/prepended to itself`);
      });

      //Throw an error if a file is including a parent
      files.forEach(file=> {
        if(this.parents.includes(file)) throw new Error(`\`${path.relative(this.rootDir, this.file)}\` can not append/prepend the parent file \`${path.relative(this.rootDir, file)}\``);
      });
    } catch (err) {
      err.line = line;
      err.column = 1;
      err.file = this.file;
      throw err;
    }

    return files;
  }

  //Resolve and recursively compile each included file
  async getIncludes(regx) {
    let result = [];
    const files = this.getMatchingFiles(regx);
    for(const { file, line } of files) {
      for(const filePath of await this.resolveFile({ file, line })) {
        const { code, map } = await JSConcat.compileFile(filePath, {
          output: this.output,
          sourceMap: this.sourceMap,
          rootDir: this.rootDir,
          parents: this.parents.concat(this.file)
        });
        result = result.concat({ code, map, file: filePath });
      }
    }
    return result;
  }

  async compile() {
    let sources = [
      ...await this.getIncludes(REGX_PREPEND),
      { file: this.file, code: this.code, map: this.inputSourceMap },
      ...await this.getIncludes(REGX_APPEND)
    ];

    return await this.joinSources(sources);
  }

  async getOriginalPosition({ source, map, line, lineContent }) {
    return await SourceMapConsumer.with(map, null, map=> {
      //Iterate over line content until a source is found
      for(const [, column] of lineContent.split('').entries()) {
        const position = map.originalPositionFor({ line, column });
        if(!position.source) continue;
        position.source = path.resolve(path.dirname(source), position.source); //Make source absolute
        return position;
      }
      return { source, line, column: 1 };
    });
  }

  async joinSources(sources) {
    const result = new SourceNode();
    for(const source of sources) {
      const lines = source.code.split('\n');
      for(const [index, data] of lines.entries()) {
        const specialRegx = [ REGX_APPEND, REGX_PREPEND, REGX_SOURCEMAP ]; //Remove append, prepend and sourcemap statements
        const hasSpecialComment = specialRegx.some( regx => regx.test(data));
        if(hasSpecialComment) continue;

        //Source Position
        let position = { line: index + 1, column: 1, source: source.file };

        //Get original source position
        if(this.sourceMap && source.map) {
          position = await this.getOriginalPosition({ map: source.map, source: position.source, line: position.line, lineContent: data });
        }

        //Add line contents
        result.add(new SourceNode( position.line, position.column, position.source, data + '\n' ));
      }
    }

    if(this.sourceMap) result.add(`//# sourceMappingURL=${path.basename(this.output)}.map`);
    let { code, map } = result.toStringWithSourceMap();
    return { code, map: this.sourceMap? map.toString(): null };
  }

  static async compileFile(file, options) {
    const readFile = promisify(fs.readFile.bind(fs));
    const code = await readFile(file, 'utf-8');
    const inputSourceMap = await readFile(`${file}.map`, 'utf-8').catch(()=>null); //Read only if exists
    return await new JSConcat({ ...options, code, file, inputSourceMap }).compile();
  }
}

module.exports = async function compile(code, options = {}) {
  return await new JSConcat({ code, ...options }).compile();
}
