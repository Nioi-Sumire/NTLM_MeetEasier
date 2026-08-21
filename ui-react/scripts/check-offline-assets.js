const fs = require('fs');
const path = require('path');

const buildRoot = path.resolve(__dirname, '..', 'build');
const externalHtmlAsset = /(?:src|href)\s*=\s*["']https?:\/\//i;
const externalCssAsset = /(?:url|@import)\s*\(\s*["']?https?:\/\//i;
const violations = [];

const inspectDirectory = (directory) => {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const file = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      inspectDirectory(file);
      return;
    }

    if (!/\.(?:css|html)$/i.test(entry.name)) return;

    const content = fs.readFileSync(file, 'utf8');
    const pattern = entry.name.endsWith('.html')
      ? externalHtmlAsset
      : externalCssAsset;

    if (pattern.test(content)) {
      violations.push(path.relative(buildRoot, file));
    }
  });
};

if (!fs.existsSync(buildRoot)) {
  console.error('Build output is missing. Run the production build first.');
  process.exit(1);
}

inspectDirectory(buildRoot);

if (violations.length > 0) {
  console.error(`External runtime assets found in: ${violations.join(', ')}`);
  process.exit(1);
}

console.log('PASS production build contains no external HTML or CSS assets');
