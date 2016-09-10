import bluebird from 'bluebird';
import _glob from 'glob';
import _fs from 'fs';
import path from 'path';
import Include from './include';
const glob = bluebird.promisify(_glob);
const fs = bluebird.promisifyAll(_fs);

export default class File {

  static appendRegX = /@(?:prepros|codekit|)-append\s+(.*)/gi;
  static prependRegX = /@(?:prepros|codekit|)-prepend\s+(.*)/gi;

  constructor(content, { filePath, parent, sourcemap }) {
    this.prepends = [];
    this.appends = [];
    this.content = content;
    this.sourcemap = sourcemap;
    this.filePath = path.normalize(filePath);
    this.fileDir = path.dirname(this.filePath);
    this.parent = parent;
  }

  isParent(filePath) {
    if(filePath === this.filePath) return true;
    if(this.parent) {
      return this.parent.isParent(filePath);
    }
    return false;
  }

  matchIncludes(regx) {
    const lines = this.content.split('\n');
    const matchedIncludes = [];

    lines.forEach((line, index ) => {
      const result = regx.exec(line);
      if (result) {
        let list = result[1];
        list = list.replace(/;|'|"/gi, ''); //Remove any semicolons, quotes or comments
        list = list.split(','); //Split multiple imports with comma
        list = list.map(item => item.trim());
        list = list.filter(item => !!item);
        matchedIncludes.push(...list.map( includePath => ({ includePath, line: index + 1})));
      }
    });

    return matchedIncludes;
  }

  matchAppends() {
    return this.matchIncludes(File.appendRegX);
  }

  matchPrepends() {
    return this.matchIncludes(File.prependRegX);
  }

  checkParent(filePath, line) {
    if(!this.isParent(filePath)) {
      return;
    }
    const error = Error(`Infinite include loop detected.}`);
    error.filePath = this.filePath;
    error.line = line;
    throw error;
  }

  async createInclude(includePath, line) {
    try {
      let content = await fs.readFileAsync(includePath);
      let sourcemap;
      try {
        sourcemap = await fs.readFileAsync(includePath + '.map');
        sourcemap.toString();
      } catch (err) {}
      const file = new File(content.toString(), {
        filePath: includePath, parent: this, sourcemap
      });
      return new Include({ line, file });
    } catch (err) {
      const error = Error('Unable to read included file.');
      error.filePath = this.filePath;
      error.line = line;
      err.originalError = err;
      throw error;
    }
  }

  async resolveGlob(patternPath, line) {
    try {
      return await glob(patternPath);
    } catch (err) {
      const error = Error('Unable to resolve glob pattern for included file.');
      error.filePath = this.filePath;
      error.line = line;
      err.originalError = err;
      throw error;
    }
  }

  async readAppends() {
    const appendMatches = this.matchAppends();

    for(const { includePath, line } of appendMatches) {
      const fullPath = path.resolve(this.fileDir, includePath);
      let appendedPaths = [ fullPath ];

      if(fullPath.indexOf('*')) {
        appendedPaths = await this.resolveGlob(fullPath, line);
      }

      for(const appendedPath of appendedPaths) {
        this.checkParent(appendedPath, line);
        const include = await this.createInclude(appendedPath, line);
        this.appends.push(include);
      }
    }
  }

  async readPrepends() {
    const prependMatches = this.matchPrepends();

    for(const { includePath, line } of prependMatches) {
      const fullPath = path.resolve(this.fileDir, includePath);
      let prependedPaths = [ fullPath ];

      if(fullPath.indexOf('*')) {
        prependedPaths = await this.resolveGlob(fullPath, line);
      }

      for(const prependedPath of prependedPaths) {
        this.checkParent(prependedPath, line);
        const include = await this.createInclude(prependedPath, line);
        this.prepends.push(include);
      }
    }
  }

  async resolveIncludes() {
    await this.readAppends();
    await this.readPrepends();
    for(const include of this.appends) {
      await include.file.resolveIncludes();
    }
    for(const include of this.prepends) {
      await include.file.resolveIncludes();
    }
  }

  getIncludeList() {
    let prepends = [];
    let appends = [];
    for(const include of this.prepends) {
      prepends = prepends.concat(include.file.getIncludeList());
    }
    for(const include of this.appends) {
      appends = appends.concat(include.file.getIncludeList());
    }
    //Add self to the middle
    return [...prepends, this, ...appends];
  }
}
