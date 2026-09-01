const fs = require('fs');
const path = require('path');
// minimal valid 64x64 PNG (transparent black) — data uri base64
const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdtLHKAAAADFBMVEX///8AAAB3rL6rAAAAAnRSTlMAgJsrAAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1EmgQAD7YAAoIbCAQKCwoMDQ4PEBEFBQUHCAkJChYeHyMnKCkqLi4uMjIyPk5KSkpKSklJSUpKSkpKSkpKTEwMDAwNDQ0OTk5PT09UFBQUFFRUVJSUlNTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU5ORkZGQkJCRkZGjo6OhoaHh4eIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg';
const buf = Buffer.from(b64, 'base64');
const outDir = path.join(__dirname, '..', 'public', 'images');
['logo.png', 'fallback.png', 'empty.png'].forEach((f) => {
  fs.writeFileSync(path.join(outDir, f), buf);
});
console.log('placeholder images written to ' + outDir);
