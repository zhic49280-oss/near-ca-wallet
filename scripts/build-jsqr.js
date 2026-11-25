const path = require('path');
const esbuild = require('esbuild');

const ROOT_DIR = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT_DIR, 'src', 'jsqr-lazy.js');

function buildJsQr() {
  esbuild.buildSync({
    stdin: {
      contents: [
        "const jsQR = require('jsqr');",
        "if (typeof window !== 'undefined' && !window.jsQR) window.jsQR = jsQR;",
        "if (typeof globalThis !== 'undefined' && !globalThis.jsQR) globalThis.jsQR = jsQR;"
      ].join('\n'),
      resolveDir: ROOT_DIR,
      loader: 'js'
    },
    bundle: true,
    minify: true,
    format: 'iife',
    legalComments: 'none',
    outfile: OUT_FILE
  });
  return OUT_FILE;
}

if (require.main === module) {
  buildJsQr();
  console.log('Built src/jsqr-lazy.js');
}

module.exports = { buildJsQr, OUT_FILE };
