# WolfPlugs for Valenced

Wolfie's plugins for Valenced. All ten plugins start at version `1.0.0`.

AddAttachments, Bot Client, Gif Text, Global Badges, MediaUtils, NSFW Blur,
PetPet, Questify, and Sound Controls.

## Install

Add this repository in Valenced's plugin repository settings:

https://plugins.obamabot.me/valenced-plugins

Install wolf plugins, then reload Valenced.

## Development

```sh
bun install
bun run package
bun run serve
```

To package the native Android plugins, run `.github/scripts/setup-native.sh` in
an environment with Java 17 and the Android command-line SDK, load the variables
it writes to `$GITHUB_ENV`, then run `bun run package`.

Add the repository URL printed by the server to Valenced on your device. The device must be able to reach your computer.

```sh
bun run lint:types
bunx biome check plugins scripts
bun run test
```

## Releases

Push to `main` after increasing the version in each changed plugin's `manifest.json`. GitHub Actions builds the ZIP, publishes it on `gh-pages`, and deploys the repository index and artifacts to GitHub Pages.

The release workflow can also be run manually. Published versions are kept for existing installs.

## Credits and license

The plugins and repository tooling were ported from [WolfPlugs for Revenge](https://github.com/WolfPlugs/revenge-plugins), based on [Revenge Community Plugins](https://github.com/revenge-mod/revenge-community-plugins).

Licensed under [GPL-3.0](LICENSE). Original author and contributor attribution is preserved.
