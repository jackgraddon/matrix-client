const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const arrpcDir = path.join(rootDir, 'server', 'arrpc');
const binariesDir = path.join(rootDir, 'src-tauri', 'binaries');

if (!fs.existsSync(binariesDir)) {
  fs.mkdirSync(binariesDir, { recursive: true });
}

console.log('--- Building arRPC Sidecar ---');

// 1. Install arRPC dependencies
console.log('Installing arRPC dependencies...');
execSync('npm install', { cwd: arrpcDir, stdio: 'inherit' });

// 2. Install pkg globally or use npx
console.log('Checking for pkg...');
try {
  execSync('npx pkg --version', { stdio: 'ignore' });
} catch (e) {
  console.log('Installing pkg locally...');
  execSync('npm install pkg', { cwd: rootDir, stdio: 'inherit' });
}

// 3. Determine target triple
const platform = process.platform;
const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

let pkgTarget = '';
let binaryExtension = '';

if (platform === 'win32') {
  pkgTarget = 'node18-win-' + arch;
  binaryExtension = '.exe';
} else if (platform === 'darwin') {
  pkgTarget = 'node18-macos-' + arch;
} else {
  pkgTarget = 'node18-linux-' + arch;
}

// 4. Get the rust target triple for the binary name
// Tauri expects binaries to be named <name>-<target-triple>[.exe]
console.log('Determining rust target triple...');
let rustTriple = '';
try {
  const output = execSync('rustc -Vv').toString();
  const hostLine = output.split('\n').find(line => line.startsWith('host:'));
  if (hostLine) {
    rustTriple = hostLine.split(' ')[1].trim();
  } else {
    throw new Error('Could not find host triple in rustc output');
  }
} catch (e) {
  console.error('Failed to determine rust triple. Please ensure rustc is installed.');
  console.error(e.message);
  process.exit(1);
}

const binaryName = `arrpc-${rustTriple}${binaryExtension}`;
const outputPath = path.join(binariesDir, binaryName);

console.log(`Building for target: ${pkgTarget}`);
console.log(`Output path: ${outputPath}`);

// 5. Run pkg
// We use the entry point of arRPC
try {
  // pkg has trouble with ESM. We'll use esbuild to bundle it into a single CJS file first.
  console.log('Bundling arRPC with esbuild...');
  try {
    execSync('npx esbuild --version', { stdio: 'ignore' });
  } catch (e) {
    console.log('Installing esbuild locally...');
    execSync('npm install esbuild', { cwd: rootDir, stdio: 'inherit' });
  }

  const bundledPath = path.join(arrpcDir, 'dist', 'index.cjs');
  if (!fs.existsSync(path.dirname(bundledPath))) {
    fs.mkdirSync(path.dirname(bundledPath), { recursive: true });
  }

  // We bundle everything except 'ws' which pkg can handle or we can bundle too.
  // Actually bundling ws is usually fine for node platform.
  execSync(`npx esbuild src/index.js --bundle --platform=node --format=cjs --outfile=${bundledPath} --external:ws --define:import.meta.url='""'`, {
    cwd: arrpcDir,
    stdio: 'inherit'
  });

  // Copy detectable.json to dist so pkg can see it relative to index.cjs
  fs.copyFileSync(path.join(arrpcDir, 'src', 'process', 'detectable.json'), path.join(arrpcDir, 'dist', 'detectable.json'));

  console.log('Compiling bundle with pkg...');
  execSync(`npx pkg package.json --targets ${pkgTarget} --output ${outputPath} --public`, {
    cwd: arrpcDir,
    stdio: 'inherit'
  });
  console.log('--- arRPC Sidecar Built Successfully ---');
} catch (e) {
  console.error('--- Failed to build arRPC sidecar ---');
  console.error(e);
  process.exit(1);
}
