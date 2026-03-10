const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const arrpcDir = path.join(rootDir, 'server', 'arrpc');
const binariesDir = path.join(rootDir, 'src-tauri', 'binaries');
const distDir = path.join(arrpcDir, 'dist');

if (!fs.existsSync(binariesDir)) fs.mkdirSync(binariesDir, { recursive: true });
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

console.log('--- Building arRPC Sidecar ---');

// 1. Determine target info
let rustTriple = '';
try {
  rustTriple = execSync('rustc -Vv').toString().split('\n').find(l => l.startsWith('host:')).split(' ')[1].trim();
} catch (e) {
  process.exit(1);
}

const binaryName = `arrpc-${rustTriple}${process.platform === 'win32' ? '.exe' : ''}`;
const outputPath = path.join(binariesDir, binaryName);

// 2. Bundle with esbuild
console.log('Step 1: Bundling code...');
execSync(`npx esbuild src/index.js --bundle --platform=node --format=cjs --outfile=${path.join(distDir, 'index.cjs')} --define:import.meta.url='"file:///snapshot/index.cjs"'`, {
  cwd: arrpcDir,
  stdio: 'inherit'
});

// 3. THE FIX: The `fs.readFileSync` Interceptor
console.log('Step 2: Injecting fs interceptor...');
// Read the JSON as a raw string
const rawJsonString = fs.readFileSync(path.join(arrpcDir, 'src', 'process', 'detectable.json'), 'utf8');
// Convert it into a 100% syntactically safe JavaScript string literal
const safeJsString = JSON.stringify(rawJsonString);

let bundleContent = fs.readFileSync(path.join(distDir, 'index.cjs'), 'utf8');

// NEW: Strip out the shebang so it doesn't cause a syntax error when pushed down
bundleContent = bundleContent.replace(/^#!.*\n/, '');

// We place this at the very top of the compiled file to intercept the read request
const polyfill = `
const _fs = require('fs');
const _originalRead = _fs.readFileSync;
_fs.readFileSync = function() {
  if (typeof arguments[0] === 'string' && arguments[0].includes('detectable.json')) {
    return ${safeJsString};
  }
  return _originalRead.apply(this, arguments);
};
`;

// Prepend polyfill to bundle
fs.writeFileSync(path.join(distDir, 'index.cjs'), polyfill + bundleContent);

// 4. Create minimal package.json
fs.writeFileSync(path.join(distDir, 'package.json'), JSON.stringify({ name: "arrpc", bin: "index.cjs" }));

// 5. Wrap with pkg
console.log('Step 3: Wrapping into binary...');
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const pkgTarget = process.platform === 'win32' ? `node18-win-${arch}` :
  process.platform === 'darwin' ? `node18-macos-${arch}` : `node18-linux-${arch}`;

execSync(`npx pkg . --targets ${pkgTarget} --output ${outputPath} --public`, {
  cwd: distDir,
  stdio: 'inherit'
});

console.log(`Success! Binary ready at ${outputPath}`);