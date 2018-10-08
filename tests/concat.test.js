import compile from '../lib/index';
import fs from 'fs-extra';
import path from 'path';

async function infoFromName(fileName) {
  const input = path.resolve(__dirname, 'fixtures/input', fileName);
  const output = path.resolve(__dirname, 'fixtures/output', fileName);
  const inputMap = `${input}.map`;
  const outputMap = `${output}.map`;
  let inputData = await fs.readFile(input, 'utf-8').catch(()=>{});
  let inputMapData = await fs.readJson(inputMap, 'utf-8').catch(()=>{});
  let outputData = await fs.readFile(output, 'utf-8').catch(()=>{});
  let outputMapData = await fs.readJson(outputMap, 'utf-8').catch(()=>{});

  return {
    input, output, inputMap, outputMap, inputData, outputData, inputMapData, outputMapData
  };
}

test('Test Basic Compilation', async ()=> {
  const file = await infoFromName('test.js');
  const result = await compile(file.inputData, { file: file.input, output: file.output, sourceMap: true });
  expect(result.code).toBe(file.outputData);
  expect(JSON.parse(result.map).mappings).toBe(file.outputMapData.mappings);
});
