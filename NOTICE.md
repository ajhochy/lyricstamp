# Third-Party Notices

LyricStamp itself is licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE.md).
It bundles and builds on the following third-party components, which retain their own
licenses. Those licenses grant the rights LyricStamp relies on and are reproduced with
the components as required.

## Bundled at runtime

- **AbletonOSC** (vendored fork under `vendor/AbletonOSC/`, shipped in the packaged app's
  resources) — MIT License, Copyright (c) Daniel John Jones and contributors.
  See `vendor/AbletonOSC/LICENSE.md`. Our fork adds arrangement-clip and project-path
  OSC handlers; the original MIT notice is preserved.

## Dependencies

This project depends on open-source packages including Electron, React, react-dom, ws,
node-osc, archiver, chordsheetjs, fast-xml-parser, and pdfjs-dist. These are distributed
under permissive licenses (MIT / BSD / Apache-2.0); their full texts are available in
`node_modules/<package>/` and via each project's repository.

The PolyForm Noncommercial terms apply to LyricStamp's own source and the work as a whole;
they do not relicense or restrict the third-party components above, which remain available
under their respective licenses.
