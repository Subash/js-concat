const path = require('path');
const fs = require('fs');
const chai = require('chai');
const expect = chai.expect;
const { processFile } = require('../lib');
const File = require('../lib/file').default;

const filePath = path.resolve(__dirname, 'fixtures/parent.js');
const content = fs.readFileSync(filePath).toString();

//@TODO Add more unit tests for more coverage and correct sourcemap position

describe('File Resolver', () => {
  describe('resolveIncludes', () => {
    it('should resolve file names.', (done) => {
      const file = new File(content, { filePath });
      file.resolveIncludes()
        .then(()=> {
          const fileList = file.getIncludeList().map((file)=> file.filePath);
          expect(fileList.length).to.equal(9);
          done();
        }).catch(done)
    });
  });
});

describe('Concat', () => {
  describe('processFile', () => {
    it('should process file.', (done) => {
      processFile(content, { filePath })
        .then(({ map, code })=> {
          expect(map).to.exist;
          expect(code).to.exist;
          done();
        }).catch(done)
    });
  });
});