'use strict';

// Custom signing hook for electron-builder.
//
// The local login keychain can contain duplicate Developer ID Application
// certificates with the same display name. electron-builder's default
// name-based lookup then fails with "ambiguous". This mirrors the Statement
// Automator packaging path by delegating to @electron/osx-sign with the SHA-1
// identity directly. Override via CSC_NAME when rotating certificates.

const path = require('path');
const { signAsync } = require('@electron/osx-sign');

const SIGNING_IDENTITY_SHA1 =
  process.env.CSC_NAME || 'CF6C1EF1525E70E6E3324388A322938977779DB7';

exports.default = async function sign(configuration) {
  const appPath = configuration.app;
  if (!appPath) {
    throw new Error('sign.cjs: missing configuration.app');
  }

  const entitlementsPath = path.join(__dirname, '..', 'assets', 'entitlements.mac.plist');

  await signAsync({
    app: appPath,
    identity: SIGNING_IDENTITY_SHA1,
    hardenedRuntime: true,
    entitlements: entitlementsPath,
    'entitlements-inherit': entitlementsPath,
    optionsForFile: () => ({
      hardenedRuntime: true,
      entitlements: entitlementsPath,
    }),
    type: 'distribution',
    platform: 'darwin',
    version: configuration.version,
    keychain: configuration.keychain,
    strictVerify: false,
    preAutoEntitlements: false,
    identityValidation: false,
  });
};
