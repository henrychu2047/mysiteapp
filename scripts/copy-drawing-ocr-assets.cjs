/* Copies browser workers that cannot be resolved from a production Next.js bundle.
 * Keep this list aligned with lib/drawing-pdf.ts and the installed package versions.
 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const publicRoot = path.join(root, 'public', 'drawing')

function packageFile(packageName, file) {
  return path.join(path.dirname(require.resolve(`${packageName}/package.json`)), file)
}

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

copy(
  packageFile('pdfjs-dist', 'build/pdf.worker.min.mjs'),
  path.join(publicRoot, 'pdfjs', 'pdf.worker.min.mjs'),
)
copy(
  packageFile('tesseract.js', 'dist/worker.min.js'),
  path.join(publicRoot, 'ocr', 'worker.min.js'),
)

// tesseract.js-core is intentionally resolved from tesseract.js's dependency
// tree, since pnpm does not hoist transitive packages to node_modules.
const tesseractPackage = packageFile('tesseract.js', 'package.json')
const corePackage = require.resolve('tesseract.js-core/package.json', {
  paths: [path.dirname(tesseractPackage)],
})
const coreRoot = path.dirname(corePackage)
for (const name of [
  'tesseract-core.wasm.js',
  'tesseract-core.wasm',
  'tesseract-core-simd.wasm.js',
  'tesseract-core-simd.wasm',
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-lstm.wasm',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm',
]) {
  copy(path.join(coreRoot, name), path.join(publicRoot, 'ocr', 'core', name))
}
