import { SourceMapConsumer, SourceNode } from 'source-map';
import path from 'path';
import fs from 'fs-extra';
import _glob from 'glob';
import { promisify } from 'util';
const glob = promisify(_glob);

class Compiler {
  static REGX_APPEND = /\/\/(\s+|)@(prepros-|codekit-|)append/;
  static REGX_PREPEND = /\/\/(\s+|)@(prepros-|codekit-|)prepend/;
  static REGX_SOURCEMAP = /\/\/(\s+|)[@#](\s+|)sourceMappingURL=/;
  static extensions = [ '.js' ];

  constructor(options) {
    this.code = options.code || '';
    this.inputSourceMap = options.inputSourceMap || '';
    this.sourceMap = options.sourceMap;
    this.file = options.file || '';
    this.output = options.output || '';
    this.baseDir = path.dirname(this.file);
    this.rootDir = options.rootDir || this.baseDir;
    this.parents = options.parents || [];
  }

  matchIncludes({ data, regx }) {
    const lines = data.split('\n');
    let files = [];
    for(let [ index, line ] of lines.entries()) {
      if(!regx.test(line)) continue;
      let list = line.replace(regx, ''); //Remove the comment part
      list = list.replace(/;|'|"/gi, ''); //Remove any semicolons or quotes
      list = list.split(','); //Split comma separated lists
      list = list.map(item => item.trim());
      list = list.filter(item => !!item);
      files.push(...list.map( item => {
        return { file: item, line: index + 1};
      }));
    }
    return files;
  }

  matchPrepends(data) {
    return this.matchIncludes({ data: data, regx: Compiler.REGX_PREPEND });
  }

  matchAppends(data) {
    return this.matchIncludes({ data: data, regx: Compiler.REGX_APPEND });
  }

  getPossiblePaths(include) {
    const file = path.resolve(this.baseDir, include.file);
    const dir = path.dirname(file);
    const name = path.basename(file);
  
    //Possible names can be file name or partial
    let names = [ name, `_${name}`];
  
    //Add possible extensions
    let files = [];
    for(const name of names) {
      files.push(name);
      for(const extension of Compiler.extensions) {
        files.push(`${name}${extension}`);
      }
    }

    //Return full paths
    return files.map( file => path.join(dir, file));
  }

  async resolveInclude(include) {
    const possiblePaths = this.getPossiblePaths(include);
    let file;

    for(const possiblePath of possiblePaths) {
      try {
        await fs.access( possiblePath, fs.constants.F_OK);
        file = possiblePath;
        break;
      } catch (err) {}
    }

    if(!file) {
      let err = new Error(`Failed to find the included file \`${include.file}\``);
      err.file = this.file;
      err.line = include.line;
      err.column = 1;
      throw err;
    }

    if(this.parents.includes(file)) {
      let err = Error(`Recursive include detected. \`${path.relative(this.rootDir, this.file)}\` is including parent file ${path.relative(this.rootDir, file)}`);
      err.file = this.file;
      err.line = include.line;
      err.column = 1;
      throw err;
    }
  
    return file;
  }

  async resolveGlobInclude(include) {
    try {
      let files = await glob(include.file, { cwd: this.baseDir });
      return files.map( file=> path.resolve(this.baseDir, file));
    } catch (e) {
      const err = new Error(`Unable to resolve the glob pattern \`${include.file}\``);
      err.file = this.file;
      err.line = include.line;
      err.column = 1;
      err.originalError = e;
      throw err;
    }
  }

  async resolveIncludes(includes) {
    const result = [];
    for(const include of includes) {
      //Resolve globs
      if(include.file.includes('*')) {
        let files = await this.resolveGlobInclude(include);
        files = files.map( file => {
          return { file, line: include.line }
        });
        result.push(...files);
      } else {
        const file = await this.resolveInclude(include);
        result.push({ file, line: include.line });
      }
    }
    return result;
  }

  async readFile(file) {
    const code = await fs.readFile(file, 'utf-8');
    let map;
    if(this.sourceMap) {
      try {
        map = await fs.readFile(`${file}.map`, 'utf-8'); //Read the map file if that exists next to the file
      } catch (err) {}
    }
    return { code, map, file };
  }

  async readAndCompile(file) {
    let code, map;
  
    try {
      const result= await this.readFile(file);
      code = result.code;
      map = result.map;
    } catch (e) {
      const err = new Error(`Failed to read the included file ${path.relative(this.rootDir, file)}`);
      err.originalError = e;
      throw err;
    }

    const compiler = new Compiler({
      file,
      code,
      inputSourceMap: map,
      sourceMap: this.sourceMap,
      rootDir: this.rootDir,
      parents: [...this.parents, this.file]
    });

    return await compiler.compile();
  }

  async readAndCompileInclude(include) {
    try {
      return this.readAndCompile(include.file);
    } catch (e) {
      const err = new Error(e.message);
      err.file = e.file || this.file;
      err.line = e.line || include.line;
      err.column = e.column || 1;
      err.originalError = e;
      throw err;
    }
  }

  async readAndCompileIncludes(includes) {
    return Promise.all( includes.map( include => this.readAndCompileInclude(include)));
  }
  
  /**
   * Join sources without sourcemaps
   */
  joinSources(sources) {
    const result = [];
    for(const { code } of sources) {
      const lines = code.split('\n');
      for(const line of lines) {
        const specialRegx = [ Compiler.REGX_APPEND, Compiler.REGX_PREPEND, Compiler.REGX_SOURCEMAP ];
        const hasSpecialComment = specialRegx.some( regx => regx.test(line));
        if(!hasSpecialComment) result.push(line);
      }
    }
    return result.join('\n');
  }

  async parseSourceMap(map, file) {
    if(!map) return;
    try {
      map = JSON.parse(map);
    } catch (e) {
      const err = new Error(`Failed to read the sourcemap file. ${path.relative(this.rootDir, file)}`);
      err.originalError = e;
      throw err;
    }

    //Provide the full source paths
    map.file = file;
    map.sources = map.sources.map((source) => path.resolve(path.dirname(file), source));
    delete map.sourceRoot;
    return await new SourceMapConsumer(map);
  }

  getOriginalPositionForLine({ line, map, lineNumber }) {
    //loop each character in the line to find the original position
    for(const [ index, column ] of line.split('').entries()) {
      const originalPosition = map.originalPositionFor({
        line: lineNumber, column: index
      });
      if(originalPosition.source) return originalPosition;
    }
  }

  /**
   * Join sources with sourcemaps
   */
  async joinSourcesWithSourcemap(sources) {
    const sourceNode = new SourceNode();
    for(const source of sources) {
      const code = source.code;
      const map = await this.parseSourceMap(source.map, source.file);
      const lines = code.split('\n');
      for(const [index, line]of lines.entries()) {
        const specialRegx = [ Compiler.REGX_APPEND, Compiler.REGX_PREPEND, Compiler.REGX_SOURCEMAP ];
        const hasSpecialComment = specialRegx.some( regx => regx.test(line));
        if(hasSpecialComment) continue;

        let lineNumber = index + 1;
        let columnNumber = 1;
        let sourcePath = source.file;

        //Find the line and column in original sourcemap if that exists
        if(map) {
          const originalPosition = this.getOriginalPositionForLine({ line, map, lineNumber });
          if(originalPosition) {
            lineNumber = originalPosition.line;
            columnNumber = originalPosition.column;
            sourcePath = originalPosition.source;
          }
        }

        //Make source path relative to the output dir
        if(this.output) sourcePath = path.relative(this.output, sourcePath);

        //Add line contents
        sourceNode.add(new SourceNode( lineNumber, columnNumber, sourcePath, line ));
        //Add newline at the end of each line
        sourceNode.add('\n');
      }

      //Sourcemap must be destroyed after use
      if(map) map.destroy();
    }
    //Add the sourcemap url
    sourceNode.add(`//# sourceMappingURL=${path.basename(this.file)}.map`);
    const result = sourceNode.toStringWithSourceMap();
    const code = result.code;
    const map = result.map.toString();
    return { code, map };
  }

  async compile() {
    let appends = this.matchAppends(this.code);
    let prepends = this.matchPrepends(this.code);

    let resolvedAppends = await this.resolveIncludes(appends);
    let resolvedPrepends = await this.resolveIncludes(prepends);

    let appendData = await this.readAndCompileIncludes(resolvedAppends);
    let prependData = await this.readAndCompileIncludes(resolvedPrepends);

    //Join prepend data, this data and the appends data
    const sources = [ ...prependData, { code: this.code, map: this.inputSourceMap, file: this.file }, ...appendData ];
    if(this.sourceMap) {
      const result = await this.joinSourcesWithSourcemap(sources);
      return {...result, file: this.file };
    } else {
      const code = this.joinSources(sources);
      return { code, file: this.file };
    }
  }
}

export default async function compile(code, options = {}) {
  return await new Compiler({ code, ...options }).compile();
}
