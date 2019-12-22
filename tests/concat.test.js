const compile = require('..');
const fs = require('fs');
const path = require('path');
const fixtures = path.resolve(__dirname, 'fixtures');

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
