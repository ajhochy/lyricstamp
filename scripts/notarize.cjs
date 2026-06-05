'use strict';

// afterSign notarization hook for electron-builder.
//
// electron-builder 26 has built-in notarization via `mac.notarize` / notarizeIfProvided(),
// but that path is unreliable when a custom `mac.sign` hook is in use (signing and
// notarization sequence is harder to control). This hook makes notarization explicit and
// guarded: it runs only in CI where credentials are present and is a clean no-op in
// local dev so `electron:dist` never fails without Apple credentials.
//
// Credential priority (CI uses API key; Apple-ID is the fallback):
//   1. APPLE_API_KEY + APPLE_API_KEY_ID + APPLE_API_ISSUER  → notarytool API-key path
//   2. APPLE_ID + APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID → notarytool password path
//   3. Neither set → log and return (no-op; local build)
//
// env var names match exactly what .github/workflows/release-electron.yml exports.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { notarize } = require('@electron/notarize');

exports.default = async function notarizeHook(context) {
  // Skip on non-macOS builds (Windows, Linux targets run in the same build job).
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const {
    APPLE_API_KEY,
    APPLE_API_KEY_ID,
    APPLE_API_ISSUER,
    APPLE_ID,
    APPLE_APP_SPECIFIC_PASSWORD,
    APPLE_TEAM_ID,
  } = process.env;

  const hasApiKey = APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER;
  const hasAppleId = APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID;

  if (!hasApiKey && !hasAppleId) {
    console.log('[notarize] no credentials in env — skipping notarization (local build)');
    return;
  }

  // Resolve the .app path from the packager context.
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);

  if (!fs.existsSync(appPath)) {
    throw new Error(`[notarize] expected .app not found at: ${appPath}`);
  }

  // Build the credential options.  API key is preferred (CI standard).
  let credOptions;
  if (hasApiKey) {
    console.log(`[notarize] submitting ${appPath} for notarization (API key: ${APPLE_API_KEY_ID}) …`);
    credOptions = {
      appPath,
      appleApiKey: APPLE_API_KEY,
      appleApiKeyId: APPLE_API_KEY_ID,
      appleApiIssuer: APPLE_API_ISSUER,
    };
  } else {
    console.log(`[notarize] submitting ${appPath} for notarization (Apple ID: ${APPLE_ID}) …`);
    credOptions = {
      appPath,
      appleId: APPLE_ID,
      appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD,
      teamId: APPLE_TEAM_ID,
    };
  }

  try {
    await notarize(credOptions);
    console.log('[notarize] notarization successful — stapling ticket …');
    execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
    console.log(`[notarize] stapled ${appPath}`);
  } catch (err) {
    throw new Error(`[notarize] notarization/staple failed for ${appPath}: ${err.message}`);
  }
};
