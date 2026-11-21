const path = require('node:path');
const { validate } = require('./validate-static-site.cjs');
try {
  const args = process.argv.slice(2), index = args.indexOf('--site-root');
  validate(path.resolve(index < 0 ? path.join(__dirname, '..') : args[index + 1]));
} catch (error) { console.error(`FAIL [site validation]: ${error.message}`); process.exitCode = 1; }
