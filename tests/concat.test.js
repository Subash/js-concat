import { expect, test } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceMapConsumer } from 'source-map';
import compile from '../lib/index.js';

const fixtures = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

test('Test compile with sourcemap', async ()=> {
  const file = path.resolve(fixtures, 'input/test.js');
  const output = path.resolve(fixtures, 'output/test.js');
  const data = fs.readFileSync(file, 'utf-8');
  const result = await compile(data, { file, output, sourceMap: true });
  // fs.writeFileSync(output, result.code);
  // fs.writeFileSync(output + '.map', result.map);
  expect(result.code).toBe(fs.readFileSync(output, 'utf-8'));
  expect(JSON.parse(result.map.toString()).mappings).toBe(JSON.parse(fs.readFileSync(`${output}.map`, 'utf-8')).mappings);
});

test('Test sourcemap positions map back to the original columns', async ()=> {
  const file = path.resolve(fixtures, 'input/test.js');
  const output = path.resolve(fixtures, 'output/test.js');
  const result = await compile('let a;\n  let = = 2;', { file, output, sourceMap: true });
  const position = await SourceMapConsumer.with(result.map.toString(), null, (consumer) => {
    return consumer.originalPositionFor({ line: 2, column: 8 });
  });
  expect(position).toMatchObject({ source: '../input/test.js', line: 2, column: 8 });
});

test('Test sourcemap positions map through input sourcemaps', async ()=> {
  const file = path.resolve(fixtures, 'input/test.js');
  const output = path.resolve(fixtures, 'output/test.js');
  const coffee = path.resolve(fixtures, 'input/coffee/coffee.js');
  const result = await compile(`// @prepros-prepend 'coffee/coffee.js'`, { file, output, sourceMap: true });
  const code = fs.readFileSync(coffee, 'utf-8').split('\n')[3];
  const line = result.code.split('\n').indexOf(code) + 1;
  const columns = [...code].map((_, column) => column).filter((column) => code[column] !== ' ');
  const expected = await SourceMapConsumer.with(fs.readFileSync(`${coffee}.map`, 'utf-8'), null, (consumer) => {
    return columns.map((column) => consumer.originalPositionFor({ line: 4, column })).map(({ line, column }) => [line, column]);
  });
  const actual = await SourceMapConsumer.with(result.map.toString(), null, (consumer) => {
    return columns.map((column) => consumer.originalPositionFor({ line, column })).map(({ line, column }) => [line, column]);
  });
  expect(actual).toEqual(expected);
});

test('Test compile without sourcemap', async ()=> {
  const file = path.resolve(fixtures, 'input/test.js');
  const output = path.resolve(fixtures, 'output/test-no-map.js');
  const data = fs.readFileSync(file, 'utf-8');
  const result = await compile(data, { file, output, sourceMap: false });
  // fs.writeFileSync(output, result.code);
  expect(result.code).toBe(fs.readFileSync(output, 'utf-8'));
});

test('Test infinite loop', async ()=> {
  const file = path.resolve(fixtures, 'input/test.js');
  const output = path.resolve(fixtures, 'output/test.js');
  await expect(compile(`//@append test.js`, { file, output, sourceMap: true })).rejects.toEqual(
    new Error('`test.js` can not be appended/prepended to itself')
  );
});

test('Test invalid include', async ()=> {
  const file = path.resolve(fixtures, 'input/test.js');
  const output = path.resolve(fixtures, 'output/test.js');
  await expect(compile(`//@append test/bogus.js`, { file, output, sourceMap: true })).rejects.toEqual(
    new Error('Unable to find the included file `test/bogus.js`')
  );
});

test('Test error line and file', async ()=> {
  const file = path.resolve(fixtures, 'input/test.js');
  const output = path.resolve(fixtures, 'output/test.js');
  try {
    await compile(`\n\n\n\n//@append test/bogus.js`, { file, output, sourceMap: true });
    await expect(true).toBe(false);
  } catch(err) {
    expect(err.message).toBe('Unable to find the included file `test/bogus.js`');
    expect(err.file).toBe(file);
    expect(err.column).toBe(1);
    expect(err.line).toBe(5);
  }
});

test('Test parent import', async ()=> {
  const file = path.resolve(fixtures, 'input/parent-import.js');
  const output = path.resolve(fixtures, 'output/parent-import.js');
  expect.assertions(2);
  try {
    await compile(fs.readFileSync(file, 'utf-8'), { file, output });
  } catch (err) {
    expect(err.message).toBe('`parent-importer.js` can not append/prepend the parent file `parent-import.js`');
    expect(err.line).toBe(5);
  }
});

test('Test no `file` option', async ()=> {
  await expect(compile('', { output: 'abc.js' })).rejects.toEqual(
    new Error('`file` is required')
  );
});

test('Test no `output` option', async ()=> {
  await expect(compile('', { file: 'abc.js' })).rejects.toEqual(
    new Error('`output` is required')
  );
});

test('Test no `code` option', async ()=> {
  await expect(compile(null, { file: 'abc.js', output: 'def.js' })).rejects.toEqual(
    new Error('`code` must be a string')
  );
});

test('Test empty `code` option', async ()=> {
  const { map, code } = await compile('', { file: 'abc.js', output: 'def.js' });
  expect(code).toBeDefined();
  expect(map).toBe(null);
});

test('Test no options', async ()=> {
  expect.assertions(1);
  try {
    await compile('');
  } catch (err) {
    expect(err).toBeTruthy();
  }
});
