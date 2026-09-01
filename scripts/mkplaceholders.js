const fs = require('fs');
// minimal valid 64x64 PNG (transparent black) — data uri base64
const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAMAAACdtLHKAAAADFBMVEX///8AAAB3rL6rAAAAAnRSTlMAgJsrAAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1EmgQAD7YAAoIbCAQKCwoMDQ4PEBEFBQUHCAkJChYeHyMnKCkqLi4uMjIyPk5KSkpKSklJSUpKSkpKSkpKTEwMDAwNDQ0OTk5PT09UFBQUFFRUVJSUlNTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU1NTU5ORkZGQkJCRkZGjo6OhoaHh4eIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg';
const buf = Buffer.from(b64, 'base64');
fs.writeFileSync('D:/CLIP-PROG/narto-drama/public/images/logo.png', buf);
fs.writeFileSync('D:/CLIP-PROG/narto-drama/public/images/fallback.png', buf);
fs.writeFileSync('D:/CLIP-PROG/narto-drama/public/images/empty.png', buf);
console.log('placeholder images written');
