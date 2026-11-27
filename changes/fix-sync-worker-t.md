### Fixed
- Sync merges off the main thread again, so a sync with a big library no longer holds up taps while it merges. Since 1.68.0 the merge's background helper failed as it started (logged as "t is not defined"), and every merge ran on the main thread instead.
