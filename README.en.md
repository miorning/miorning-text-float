# Miorning Text Float · 喵咛文本窗

A draggable, resizable editor for small web text fields, with local versions and native image references.

**v0.4.1** · [Download](https://github.com/miorning/miorning-text-float/releases/download/v0.4.1/MiorningTextFloat-v0.4.1.zip) · [Release notes](https://github.com/miorning/miorning-text-float/releases/tag/v0.4.1)

[中文](README.md) · [Bilibili](https://space.bilibili.com/353186187) · [Validation](docs/VALIDATION.md)

## Changes

- Narrowed native `@` popup detection so canvas titles and ordinary toolbars are not lifted into persistent floating strips.

- Enabled on ordinary HTTP / HTTPS sites by default. **Alt + K** pauses or resumes all tabs; record a custom combination in Settings.
- A check-sign cat docks to any edge. The sign peeks out when collapsed; hovering or focusing reveals the cat flush against the edge. Click for shortcuts, cache, and the global switch. The icon becomes translucent while paused and remains usable.
- Improved native `@` popup stacking, including text-only lists, CSS thumbnails, nested popups, and LibTV reference panels. Native options and events are preserved.
- Removed the keep-original-text option. Complete image names can still show a gray Tab suggestion; unresolved references leave the original text intact.

## Editing

Drag and resize from all edges. Use **14–64** font sizes, a number-triggered slider, and remembered light / dark mode.

**Enter** inserts a newline; **Esc** confirms and closes. The first Esc dismisses an open font slider. New blank fields start at version 1; editing a saved version creates a new one. Selected-site cache clearing requires a second confirmation and preserves preferences, shortcuts, dock position, and the global switch.

## Install / update

Extract `MiorningTextFloat-v0.4.1.zip`; enable Chrome / Edge Developer mode and load **extension**. To update, replace files in the existing installation directory, reload the extension, then refresh open pages. Do not uninstall: uninstalling removes local history.

This version requests access to all sites. Accept any browser permission update to enable it. Browser site-access restrictions still apply. Pause / resume synchronizes across existing and new tabs without removing website text.

Shortcuts work while an ordinary page is focused; browser or OS shortcuts can conflict. Browser internal pages and protected stores cannot run content scripts. Use the toolbar icon to open Settings there.

## Scope and license

Chrome / Edge 120+. All-site permission does not guarantee every editor is compatible. Closed shadow roots, cross-origin frames, canvas-only inputs, and special reference systems remain bounded. See [Validation](docs/VALIDATION.md).

No telemetry, prompt-upload service, or generation API. See [Privacy](docs/PRIVACY.md). Code: [GPL-3.0-or-later](LICENSE). [Build](SOURCE.md) · [Release notes](RELEASE-NOTES.md) · [Assets](THIRD_PARTY_NOTICES.md).
