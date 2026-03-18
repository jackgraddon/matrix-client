export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const target = query.target as string; // e.g. windows-x86_64, darwin-aarch64
  const currentVersion = query.arch as string; // Wait, tauri sends version in 'current_version' or similar?
  // Actually Tauri 2 updater sends:
  // GET /api/update/windows-x86_64/0.1.0?arch=x86_64&target=windows-x86_64&version=0.1.0
  // Or whatever you configured in endpoints.

  const version = query.version as string;
  const arch = query.arch as string;

  console.log(`Update check from ${target} version ${version} (arch: ${arch})`);

  try {
    // Fetch latest release from GitHub
    // Hardcoding the repo for now since it's the owner's repo
    const repo = "jackg/tumult";
    const response = await $fetch<any>(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: {
        'User-Agent': 'Tumult-Updater'
      }
    });

    const latestTag = response.tag_name;
    const latestVersion = latestTag.replace(/^v/, '');

    // Basic semver check (Tauri does this too, but we can be proactive)
    if (latestVersion === version) {
       setResponseStatus(event, 204);
       return;
    }

    // Map GitHub assets to Tauri updater format
    const platforms: any = {};

    // Assets are usually named like:
    // Tumult_0.1.0_x64_en-US.msi.zip
    // Tumult_0.1.0_x64_en-US.msi.zip.sig
    // Tumult.app.tar.gz
    // Tumult.app.tar.gz.sig

    for (const asset of response.assets) {
      const name = asset.name;
      const url = asset.browser_download_url;

      if (name.endsWith('.msi.zip') && !name.endsWith('.sig')) {
        // Windows x64
        platforms['windows-x86_64'] = {
          url,
          signature: await fetchSignature(response.assets, name)
        };
      } else if (name.endsWith('.app.tar.gz') && !name.endsWith('.sig')) {
        // macOS (can be universal or specific, GitHub actions usually builds universal or x64)
        platforms['darwin-x86_64'] = {
           url,
           signature: await fetchSignature(response.assets, name)
        };
        platforms['darwin-aarch64'] = {
           url,
           signature: await fetchSignature(response.assets, name)
        };
      } else if (name.endsWith('.AppImage.tar.gz') && !name.endsWith('.sig')) {
        // Linux
        platforms['linux-x86_64'] = {
          url,
          signature: await fetchSignature(response.assets, name)
        };
      }
    }

    return {
      version: latestVersion,
      notes: response.body,
      pub_date: response.published_at,
      platforms
    };

  } catch (e) {
    console.error("Failed to fetch latest release:", e);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch update info"
    });
  }
});

async function fetchSignature(assets: any[], fileName: string): Promise<string> {
  const sigAsset = assets.find(a => a.name === `${fileName}.sig`);
  if (!sigAsset) return "";

  try {
    const sigText = await $fetch<string>(sigAsset.browser_download_url);
    return sigText.trim();
  } catch (e) {
    console.error(`Failed to fetch signature for ${fileName}:`, e);
    return "";
  }
}
