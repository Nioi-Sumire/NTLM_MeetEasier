const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..');
const buildRoot = path.join(projectRoot, 'ui-react', 'build');
const staticRoot = path.join(projectRoot, 'static');
const indexFile = path.join(buildRoot, 'index.html');

function fail(message) {
  console.error(`Build contract failed: ${message}`);
  process.exit(1);
}

function requireFile(file, description) {
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) {
    fail(`${description} is missing: ${path.relative(projectRoot, file)}`);
  }
}

requireFile(indexFile, 'HTML entry point');

[
  ['manifest.json', 'web app manifest'],
  ['favicon.ico', 'favicon'],
  [path.join('svgs', 'spinner.svg'), 'spinner image'],
  [path.join('vendor', 'foundation', 'foundation.css'), 'local Foundation CSS'],
  [path.join('vendor', 'foundation', 'LICENSE'), 'Foundation license'],
  [path.join('vendor', 'titillium-web', 'titillium-web.css'), 'local font CSS'],
  [path.join('vendor', 'titillium-web', 'LICENSE'), 'font license']
].forEach(([relativeFile, description]) => {
  requireFile(path.join(buildRoot, relativeFile), description);
});

[200, 300, 400, 600, 700].forEach((weight) => {
  ['woff', 'woff2'].forEach((extension) => {
    const filename = `titillium-web-latin-${weight}-normal.${extension}`;
    requireFile(
      path.join(buildRoot, 'vendor', 'titillium-web', 'files', filename),
      `local Titillium Web ${weight} ${extension} file`
    );
  });
});

const html = fs.readFileSync(indexFile, 'utf8');

if (!/<div\s+id=["']app["']><\/div>/i.test(html)) {
  fail('index.html does not contain the React mount point #app');
}

if (/%PUBLIC_URL%/.test(html)) {
  fail('index.html still contains an unresolved PUBLIC_URL placeholder');
}

const references = Array.from(
  html.matchAll(/(?:src|href)=["']([^"']+)["']/gi),
  (match) => match[1]
).filter((reference) => (
  reference.startsWith('/') && !reference.startsWith('//')
));

[
  '/manifest.json',
  '/favicon.ico',
  '/vendor/titillium-web/titillium-web.css',
  '/vendor/foundation/foundation.css',
  '/css/styles.css'
].forEach((reference) => {
  if (!references.includes(reference)) {
    fail(`index.html is missing required reference ${reference}`);
  }
});

if (!references.some((reference) => /\.js(?:\?|$)/.test(reference))) {
  fail('index.html does not reference a JavaScript bundle');
}

references.forEach((reference) => {
  const pathname = reference.split(/[?#]/, 1)[0];
  const relativeFile = pathname.replace(/^\/+/, '');
  const candidates = [
    path.join(staticRoot, relativeFile),
    path.join(buildRoot, relativeFile)
  ];

  if (!candidates.some((candidate) => (
    fs.statSync(candidate, { throwIfNoEntry: false })?.isFile()
  ))) {
    fail(`referenced asset is not served by Express: ${reference}`);
  }
});

console.log('PASS production build matches the Express static-serving contract');
