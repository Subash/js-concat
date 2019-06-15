const path = require('path');
const slash = require('slash');
const { SourceMapConsumer, SourceNode } = require('source-map');
const REGX_APPEND = /\/\/(\s+|)@(prepros-|codekit-|)append/;
const REGX_PREPEND = /\/\/(\s+|)@(prepros-|codekit-|)prepend/;
const REGX_SOURCEMAP = /\/\/(\s+|)[@#](\s+|)sourceMappingURL=/;

/**
 *
 * @param {Object[]} sources List of sources to join
 * @param {string} sources[].code Source code to join
 * @param {string} sources[].file Full path of the file
 */
async function joinWithoutSourceMap(sources) {
  return sources.map(source=> {
    return source.code.split('\n')
      .filter(line=> !REGX_APPEND.test(line)) //Remove append statements
      .filter(line=> !REGX_PREPEND.test(line)) //Remove prepend statements
      .filter(line=> !REGX_SOURCEMAP.test(line)) //Remove sourcemap statements
      .join('\n'); //Join lines back
  }).join('\n'); //Join sources with a new line
}

/**
 *
 * @param {Object[]} sources List of sources to join
 * @param {string} sources[].code Source code to join
 * @param {string} sources[].map Sourcemap of the code
 * @param {string} sources[].file Full path of the file
 * @param {string} output Output path of the file used for source map url
 */

async function joinWithSourceMap(sources, output) {
  const result = new SourceNode();
  for(const source of sources) {
    let inputMap = source.map? await new SourceMapConsumer(source.map): null;

    //Iterate over each line
    for(const [lineIndex, line] of source.code.split('\n').entries()) {

      if(REGX_APPEND.test(line)) continue; //Remove append statements
      if(REGX_PREPEND.test(line)) continue; //Remove prepend statements
      if(REGX_SOURCEMAP.test(line)) continue; //Remove sourcemap statements

      //Iterate over each character in line
      for(const [columnIndex, column] of line.split('').entries()) {
        let position = {
          line: lineIndex + 1,
          column: columnIndex + 1,
          source: slash(path.relative(path.dirname(output), source.file)) //Make source paths relative
        };

        //Get original position
        if(inputMap) {
          const originalPosition = inputMap.originalPositionFor({ line: position.line, column: position.column });
          if(originalPosition && originalPosition.source) {
            let originalSource = path.resolve(path.dirname(source.file), originalPosition.source); //Get absolute path of the source file
            originalSource = slash(path.relative(path.dirname(output), originalSource)); //Make source relative to the new output file
            position = { line: originalPosition.line, column: originalPosition.column, source: originalSource };
          }
        }

        //Add character to the result
        result.add(new SourceNode(position.line, position.column, position.source, column));
      }

      //Add new line at the end of each line
      result.add('\n');
    }

    //instances of SourceMapConsumer must be destroyed after use
    if(inputMap) inputMap.destroy();
  }

  //Add source mapping url
  result.add(`//# sourceMappingURL=${path.basename(output)}.map`);

  return result.toStringWithSourceMap();
}

module.exports = async function joinSources(sources, { output, sourceMap }) {
  if(sourceMap) return await joinWithSourceMap(sources, output);
  return { code: await joinWithoutSourceMap(sources), map: null };
}
