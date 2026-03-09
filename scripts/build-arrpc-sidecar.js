import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

async function build() {
    try {
        // Get target triple from rustc (via a simple command since we can't easily replicate host detection exactly)
        const targetTriple = execSync('rustc -vV').toString()
            .split('\n')
            .find(line => line.startsWith('host:'))
            ?.split(' ')[1]
            ?.trim();

        if (!targetTriple) {
            throw new Error('Could not determine target triple from rustc');
        }

        console.log(`Building arRPC sidecar for ${targetTriple}...`);

        const binaryName = `arrpc-${targetTriple}`;
        const outDir = join(process.cwd(), 'src-tauri');
        const binaryFile = join(outDir, targetTriple.includes('windows') ? `${binaryName}.exe` : binaryName);

        if (existsSync(binaryFile)) {
            console.log(`Sidecar already exists at ${binaryFile}, skipping build.`);
            return;
        }

        // Determine pkg target
        const platform = os.platform(); // 'win32', 'darwin', 'linux'
        const arch = os.arch(); // 'x64', 'arm64'

        let pkgPlatform = '';
        switch (platform) {
            case 'win32': pkgPlatform = 'win'; break;
            case 'darwin': pkgPlatform = 'macos'; break;
            case 'linux': pkgPlatform = 'linux'; break;
            default: pkgPlatform = 'linux'; break;
        }

        const pkgTarget = `node18-${pkgPlatform}-${arch === 'x64' ? 'x64' : 'arm64'}`;

        // Ensure submodule dependencies are installed
        console.log('Installing dependencies for arRPC submodule...');
        execSync('npm install', { cwd: join(process.cwd(), 'server', 'arrpc'), stdio: 'inherit' });

        // Build with pkg
        console.log(`Running pkg for target ${pkgTarget}...`);
        const pkgPath = join(process.cwd(), 'node_modules', '.bin', platform === 'win32' ? 'pkg.cmd' : 'pkg');

        execSync(`"${pkgPath}" server/arrpc/package.json --targets ${pkgTarget} --output "${binaryFile}"`, {
            stdio: 'inherit'
        });

        console.log(`Done! Sidecar built at ${binaryFile}`);
    } catch (error) {
        console.error('Failed to build arRPC sidecar:', error);
        process.exit(1);
    }
}

build();
