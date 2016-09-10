const path = require('path');
const fs = require('fs');
const File  = require('../lib/file.js').default;

const parentFile = path.resolve(__dirname, 'fixtures/parent.js');
const parentData = fs.readFileSync(parentFile).toString();

const file = new File(parentData, { filePath: parentFile });

file.resolveIncludes()
  .then(()=> console.log(file, file.getIncludeList()))
  .catch((err)=> console.dir(err));