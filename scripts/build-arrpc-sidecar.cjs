const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const arrpcDir = path.join(rootDir, 'server', 'arrpc');
const binariesDir = path.join(rootDir, 'src-tauri', 'binaries');
const distDir = path.join(arrpcDir, 'dist');

if (!fs.existsSync(binariesDir)) fs.mkdirSync(binariesDir, { recursive: true });
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

console.log('--- Building arRPC Sidecar (Node 25 Final) ---');

// Determine Target Triple
let rustTriple = process.env.TAURI_ENV_TARGET_TRIPLE ||
  execSync('rustc -Vv').toString().split('\n').find(l => l.startsWith('host:')).split(' ')[1].trim();

const isWindows = rustTriple.includes('windows');
const isMac = rustTriple.includes('apple') || rustTriple.includes('darwin');
const binaryName = `arrpc-${rustTriple}${isWindows ? '.exe' : ''}`;
const outputPath = path.join(binariesDir, binaryName);

// Bundle with esbuild
console.log('Step 1: Bundling code...');
const bundlePath = path.join(distDir, 'index.cjs');

execSync(`npx esbuild src/index.js --bundle --platform=node --format=cjs --outfile="${bundlePath}" --define:import.meta.url="__import_meta_url"`, {
  cwd: arrpcDir,
  stdio: 'inherit'
});

// Manual Asset Injection (Bypasses E2BIG)
console.log('Step 2: Injecting assets and polyfills...');
const detectableData = fs.readFileSync(path.join(arrpcDir, 'src', 'process', 'detectable.json'), 'utf8');
let originalBundle = fs.readFileSync(bundlePath, 'utf8');

originalBundle = originalBundle.replace(/^#!.*\n/, '');

const polyfill = `
const fs = require('fs');
const _origRead = fs.readFileSync;
const _detectable = ${JSON.stringify(detectableData)};
fs.readFileSync = function(p, opts) {
  if (typeof p === 'string' && p.includes('detectable.json')) return _detectable;
  return _origRead.apply(this, arguments);
};
const __import_meta_url = require('url').pathToFileURL(__filename).href;
\n`;

fs.writeFileSync(bundlePath, polyfill + originalBundle);

// Create SEA Blob
console.log('Step 3: Generating Node SEA Blob...');
const seaConfigPath = path.join(distDir, 'sea-config.json');
fs.writeFileSync(seaConfigPath, JSON.stringify({
  main: bundlePath,
  output: path.join(distDir, 'sea-prep.blob'),
  disableExperimentalSEAWarning: true
}, null, 2));

execSync(`node --experimental-sea-config "${seaConfigPath}"`, { stdio: 'inherit' });

// Finalize Binary
console.log('Step 4: Preparing base binary...');
fs.copyFileSync(process.execPath, outputPath);

if (isMac) {
  console.log('... Removing existing signatures');
  // We MUST remove signatures before postjecting
  try { execSync(`codesign --remove-signature "${outputPath}"`); } catch (e) { }

  const lipoInfo = execSync(`lipo -info "${outputPath}"`).toString();
  if (lipoInfo.includes('Architectures in the fat file')) {
    const arch = rustTriple.startsWith('aarch64') ? 'arm64' : 'x86_64';
    execSync(`lipo "${outputPath}" -thin ${arch} -output "${outputPath}"`);
  }
}

console.log('Step 5: Injecting blob...');
let postjectCmd = `npx postject "${outputPath}" NODE_SEA_BLOB "${path.join(distDir, 'sea-prep.blob')}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
if (isMac) postjectCmd += ' --macho-segment-name NODE_SEA';

execSync(postjectCmd, { stdio: 'inherit' });

if (isMac) {
  console.log('... Re-signing binary for local execution');
  // Ad-hoc sign so macOS allows it to run
  execSync(`codesign -s - "${outputPath}"`);
}

console.log('Step 5: Injecting blob...');
let postjectCmd = `npx postject "${outputPath}" NODE_SEA_BLOB "${path.join(distDir, 'sea-prep.blob')}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
if (isMac) postjectCmd += ' --macho-segment-name NODE_SEA';

execSync(postjectCmd, { stdio: 'inherit' });

if (isMac) {
  execSync(`codesign -s - "${outputPath}"`);
}

console.log(`\nSuccess! Sidecar built: ${binaryName}`);