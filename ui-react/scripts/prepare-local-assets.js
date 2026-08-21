const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const vendorRoot = path.join(projectRoot, 'public', 'vendor');
const foundationRoot = path.dirname(require.resolve('foundation-sites/package.json'));
const fontRoot = path.dirname(require.resolve('@fontsource/titillium-web/package.json'));
const fontWeights = [200, 300, 400, 600, 700];

const copyFile = (source, destination) => {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
};

fs.rmSync(vendorRoot, { recursive: true, force: true });

copyFile(
  path.join(foundationRoot, 'dist', 'foundation.css'),
  path.join(vendorRoot, 'foundation', 'foundation.css')
);
copyFile(
  path.join(foundationRoot, 'LICENSE'),
  path.join(vendorRoot, 'foundation', 'LICENSE')
);

const fontCss = fontWeights.map((weight) => fs.readFileSync(
  path.join(fontRoot, `latin-${weight}.css`),
  'utf8'
)).join('\n');

const fontDestination = path.join(vendorRoot, 'titillium-web');
fs.mkdirSync(path.join(fontDestination, 'files'), { recursive: true });
fs.writeFileSync(
  path.join(fontDestination, 'titillium-web.css'),
  fontCss,
  'utf8'
);

fontWeights.forEach((weight) => {
  ['woff', 'woff2'].forEach((extension) => {
    const filename = `titillium-web-latin-${weight}-normal.${extension}`;
    copyFile(
      path.join(fontRoot, 'files', filename),
      path.join(fontDestination, 'files', filename)
    );
  });
});

copyFile(
  path.join(fontRoot, 'LICENSE'),
  path.join(fontDestination, 'LICENSE')
);

console.log('Prepared local Foundation and Titillium Web assets.');
