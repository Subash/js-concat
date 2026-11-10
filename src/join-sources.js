import { SourceMapConsumer, SourceNode } from 'source-map';
import path from 'node:path';

const REGX_APPEND = /\/\/(\s+|)@(prepros-|codekit-|)append/;
const REGX_PREPEND = /\/\/(\s+|)@(prepros-|codekit-|)prepend/;
const REGX_SOURCEMAP = /\/\/(\s+|)[@#](\s+|)sourceMappingURL=/;

/**
 * Replaces all backslashes with forward slashes in a given path.
 * @param {string} path - The path to be processed.
 * @returns {string} The processed path.
 */
function slash(path) {
  return path.replaceAll('\\', '/');
}

/**
 * Records the output lines that came from a source file.
 * @param {Object[]} ranges List of line ranges to add to
 * @param {string} file Full path of the file
 * @param {number} start First output line of the source
 * @param {number} lines Number of output lines from the source
 */
function addRange(ranges, file, start, lines) {
  if(lines > 0) ranges.push({ file, start, end: start + lines - 1 });
}

/**
 *
 * @param {Object[]} sources List of sources to join
 * @param {string} sources[].code Source code to join
 * @param {string} sources[].file Full path of the file
 */
async function joinWithoutSourceMap(sources) {
  const ranges = [];
  let line = 1;

  const code = sources.map(source=> {
    const lines = source.code.split('\n')
      .filter(line=> !REGX_APPEND.test(line)) // remove append statements
      .filter(line=> !REGX_PREPEND.test(line)) // remove prepend statements
      .filter(line=> !REGX_SOURCEMAP.test(line)); // remove sourcemap statements

    const count = Math.max(lines.length, 1); // an empty source still takes a line when sources are joined
    addRange(ranges, source.file, line, count);
    line += count;
    return lines.join('\n'); // join lines back
  }).join('\n'); // join sources with a new line

  return { code, sources: ranges };
}

/**
 *
 * @param {Object[]} sources List of sources to join
 * @param {string} sources[].code Source code to join
 * @param {string} sources[].map Sourcemap of the code
 * @param {string} sources[].file Full path of the file
 * @param {string} output Output path of the file used for source map
 */

async function joinWithSourceMap(sources, output) {
  let outputLine = 1;
  const ranges = [];
  const result = new SourceNode();

  const outputDir = path.dirname(output);
  const relativeTo = file=> slash(path.relative(outputDir, file));

  for(const source of sources) {
    let inputMap = source.map? await new SourceMapConsumer(source.map): null;
    const start = outputLine;
    const originalSources = new Map();
    const sourcePath = relativeTo(source.file);

    // iterate over each line
    for(const [lineIndex, line] of source.code.split('\n').entries()) {

      if(REGX_APPEND.test(line)) continue; // remove append statements
      if(REGX_PREPEND.test(line)) continue; // remove prepend statements
      if(REGX_SOURCEMAP.test(line)) continue; // remove sourcemap statements

      // iterate over each character in line
      for(const [columnIndex, column] of line.split('').entries()) {
        let position = { line: lineIndex + 1, column: columnIndex, source: sourcePath };

        // get original position
        if(inputMap) {
          const originalPosition = inputMap.originalPositionFor({ line: position.line, column: position.column });
          if(originalPosition && originalPosition.source) {
            let originalSource = originalSources.get(originalPosition.source);

            if(originalSource === undefined) {
              originalSource = relativeTo(path.resolve(path.dirname(source.file), originalPosition.source));
              originalSources.set(originalPosition.source, originalSource);
            }

            position = { line: originalPosition.line, column: originalPosition.column, source: originalSource };
          }
        }

        // add character to the result
        result.add(new SourceNode(position.line, position.column, position.source, column));
      }

      // add new line at the end of each line
      result.add('\n');
      outputLine++;
    }

    addRange(ranges, source.file, start, outputLine - start); // record the lines added from this source

    // instances of SourceMapConsumer must be destroyed after use
    if(inputMap) inputMap.destroy();
  }

  const { code, map } = result.toStringWithSourceMap();
  return { code, map, sources: ranges };
}

export default async function joinSources(sources, { output, sourceMap }) {
  if(sourceMap) return await joinWithSourceMap(sources, output);
  return { ...await joinWithoutSourceMap(sources), map: null };
}
