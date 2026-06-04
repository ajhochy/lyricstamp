'use strict';

// Custom signing hook for electron-builder.
//
// electron-builder 26 always calls codesign with --sign <DISPLAY_NAME>.
// When the login keychain contains two Developer ID certs with the same name
// codesign fails with "ambiguous". This hook bypasses that by passing the
// SHA-1 fingerprint directly to @electron/osx-sign.
//
// In CI the temp keychain (CSC_KEYCHAIN) has exactly one cert so no SHA-1
// is needed there — but the hook is still called and works fine because
// configuration.keychain is the temp keychain path.
//
// Local certificate rotation: set CSC_NAME to the new SHA-1 fingerprint.

const path = require('path');
const { signAsync } = require('@electron/osx-sign');

// SHA-1 fingerprint of the Developer ID Application cert to use.
// In CI this is ignored in practice (temp keychain has one cert), but it is
// still passed so the hook is self-contained.
const IDENTITY = process.env.CSC_NAME || 'CF6C1EF1525E70E6E3324388A322938977779DB7';

exports.default = async function sign(configuration) {
  const appPath = configuration.app;
  if (!appPath) throw new Error('sign.cjs: missing configuration.app');

  // entitlements.plist lives at repo root (same pattern as Bulletin Generator)
  const entitlementsPath = path.join(__dirname, '..', 'entitlements.plist');

  await signAsync({
    app: appPath,
    identity: IDENTITY,
    hardenedRuntime: true,
    entitlements: entitlementsPath,
    'entitlements-inherit': entitlementsPath,
    optionsForFile: () => ({ hardenedRuntime: true, entitlements: entitlementsPath }),
    type: 'distribution',
    platform: 'darwin',
    version: configuration.version,
    // Pass CI temp keychain through when set (CSC_KEYCHAIN env → configuration.keychain)
    keychain: configuration.keychain,
    strictVerify: false,
    preAutoEntitlements: false,
    identityValidation: false,
  });
};
