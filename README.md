# WolfPlugs for Valenced

Wolfie's plugins for Valenced. All ten plugins start at version `1.0.0`.

AddAttachments, Bot Client, Gif Text, Global Badges, ToyLink, MediaUtils, NSFW Blur,
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

## ToyLink

Connect toys through either Lovense Remote or Intiface Central / a Buttplug server.
Choose the connection in ToyLink settings. Automatic vibration starts disabled.

For Lovense, pair your toy in Lovense Remote, enable its LAN API, and keep Remote
open on the same network as Discord. Enter Remote's HTTPS address. The default
address is for Remote on PC; mobile Remote needs its own LAN domain and HTTPS
port. This uses the [official Lovense Standard LAN API](https://developer.lovense.com/docs/standard-solutions/standard-api)
and needs no developer token.

For Intiface, enable **Use Intiface / Buttplug**, start the server in Intiface
Central, and scan for your toys there. Enter the server's WebSocket address.
The default is `ws://127.0.0.1:12345`. If Intiface runs on another computer, use
that computer's LAN IP and enable Intiface's **Listen on all network interfaces**
setting. Both devices must be able to reach each other. This uses
[Buttplug protocol v3](https://buttplug.io/docs/spec-v3/spec/identification/).
Only vibration features are controlled; devices that only rotate or move linearly
are excluded.

Use **Check connection** first. For Intiface it lists vibration-capable devices
and their indices. Enter an index to target one toy, or leave it blank for all.
Lovense has a separate toy ID field with the same blank-for-all behavior.
Use **Test vibration**, then enable automatic vibration and choose message,
incoming call, or individual sound triggers. No Discord message content is sent
to either server.

Message triggers include muted channels and ignore your own messages. Sound
triggers depend on Discord attempting to play the sound. Discord must be running;
OS push notifications received while Discord is closed cannot trigger ToyLink.
Intiface pulses require Discord in the foreground and stop when it goes into the
background. Pulses last 2–10 seconds at strength 1–20, normalized to 0–1 for
Buttplug. Events during a pulse are skipped.

**Stop vibration** cancels the current pulse, including a manual test. Intiface
sends `StopAllDevices`, stopping all devices on that connection. Disabling
automatic vibration, changing the connection type, or unloading the plugin also
stops its current pulse. Network failures are reported; stopping physical hardware
requires a working connection. Live operation still needs verification with
Valenced and connected toys.

ToyLink replaces the unreleased Lovesense plugin, with plugin ID `wolfie.toylink`.
If you installed the earlier Lovesense ZIP, remove that plugin before installing
ToyLink and configure the new plugin's settings.
