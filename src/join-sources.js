import { SourceMapConsumer, SourceNode } from 'source-map';

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
 *
 * @param {Object[]} sources List of sources to join
 * @param {string} sources[].code Source code to join
 * @param {string} sources[].file Full path of the file
 */
async function joinWithoutSourceMap(sources) {
  return sources.map(source=> {
    return source.code.split('\n')
      .filter(line=> !REGX_APPEND.test(line)) // remove append statements
      .filter(line=> !REGX_PREPEND.test(line)) // remove prepend statements
      .filter(line=> !REGX_SOURCEMAP.test(line)) // remove sourcemap statements
      .join('\n'); // join lines back
  }).join('\n'); // join sources with a new line
}

/**
 *
 * @param {Object[]} sources List of sources to join
 * @param {string} sources[].code Source code to join
 * @param {string} sources[].map Sourcemap of the code
 * @param {string} sources[].file Full path of the file
 */

async function joinWithSourceMap(sources) {
  const result = new SourceNode();
  for(const source of sources) {
    let inputMap = source.map? await new SourceMapConsumer(source.map): null;

    // iterate over each line
    for(const [lineIndex, line] of source.code.split('\n').entries()) {

      if(REGX_APPEND.test(line)) continue; // remove append statements
      if(REGX_PREPEND.test(line)) continue; // remove prepend statements
      if(REGX_SOURCEMAP.test(line)) continue; // remove sourcemap statements

      // iterate over each character in line
      for(const [columnIndex, column] of line.split('').entries()) {
        let position = {
          line: lineIndex + 1,
          column: columnIndex + 1,
          source: slash(source.file)
        };

        // get original position
        if(inputMap) {
          const originalPosition = inputMap.originalPositionFor({ line: position.line, column: position.column });
          if(originalPosition && originalPosition.source) {
            position = { line: originalPosition.line, column: originalPosition.column, source: slash(originalPosition.source) };
          }
        }

        // add character to the result
        result.add(new SourceNode(position.line, position.column, position.source, column));
      }

      // add new line at the end of each line
      result.add('\n');
    }

    // instances of SourceMapConsumer must be destroyed after use
    if(inputMap) inputMap.destroy();
  }

  return result.toStringWithSourceMap();
}

export default async function joinSources(sources, { sourceMap }) {
  if(sourceMap) return await joinWithSourceMap(sources);
  return { code: await joinWithoutSourceMap(sources), map: null };
}
