import { SourceMapConsumer, SourceNode } from 'source-map';
import path from 'path';
import _File from './file';
export const File = _File;

function parseSourcemap(mapString, filePath) {
  if(!mapString) return;
  const map = JSON.parse(mapString);
  map.file = filePath;
  map.sources = map.sources.map((source) => {
    return path.resolve(path.dirname(filePath), source);
  });
  delete map.sourceRoot;
  return new SourceMapConsumer(map);
}

function getOriginalPositionForLine({ lineCode, sourcemap, lineNumber }) {
  //loop line columns to find original position
  let originalPosition = {};
  for(let columnNum = 0; columnNum< lineCode.length; columnNum++) {
    originalPosition = sourcemap.originalPositionFor({
      line: lineNumber, column: columnNum
    });
    if(originalPosition.source) break;
  }
  return originalPosition;
}

export function concatFiles(files) {
  const sourceNode = new SourceNode();

  for(const file of files) {
    const filePath = file.filePath;
    const code = file.content;
    const sourcemap = parseSourcemap(file.sourcemap, filePath);
    const lines = code.split('\n');

    lines.forEach((lineCode, index)=> {
      //Remove any old source mapping url refrences
      lineCode = lineCode.replace(/^(\/\/)[@#]\s+sourceMappingURL=[\w.]+/, '');

      //Add 1 in index for actual line number
      let lineNumber = index + 1;
      let sourcePath = filePath;
      let columnNumber = 0;

      if(sourcemap) {
        let originalPosition = getOriginalPositionForLine({ lineCode, lineNumber, sourcemap});
        if(originalPosition.source) {
          lineNumber = originalPosition.line;
          columnNumber = originalPosition.column;
          sourcePath = originalPosition.source;
        }
      }

      //Add line
      sourceNode.add(new SourceNode( lineNumber, columnNumber, sourcePath, lineCode));
      //Add newline at the end of each line
      sourceNode.add('\n');
    });
  }

  return sourceNode.toStringWithSourceMap();
}

export async function processFile(content, {filePath, sourcemap}) {
  const file = new File(content, { filePath, sourcemap });
  await file.resolveIncludes();
  const includes = file.getIncludeList();
  const { code, map } = concatFiles(includes);
  return { includes, code, map };
}