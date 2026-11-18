### Added
- Settings → About → **Unreleased builds** (Android, this device only): the update check also offers the newest build of main, every change once it's merged, before it's a release. It's named by its commit ("Waypage build 4f2c9a1 is out") and downloads like an update. Off goes back to releases only. These builds aren't on the Releases page.

### Changed
- The web copy deploys from GitHub Actions after the tests pass (`pages.yml`), as LifeLog's does, and serves the unreleased build under `unreleased/`.
