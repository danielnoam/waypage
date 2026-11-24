### Added
- Find chapters and Website sync read a comix.to title's chapters. Each chapter there is posted by several scan groups, so Waypage reads one group's: the group in the link (`?group_id=`), else an official one, unless it is far behind the newest chapter, then the group with the newest. The collection stays with that group when it checks for new chapters. Android only; not built for iOS or the web copy.
- A comix.to chapter saves as a comic with all its pictures: every panel is found (the site shows them as you scroll) and kept on the device, so none says "Image loads when you're online". Android only; chapters saved before this have only their first panels and need saving again.

### Fixed
- A comix.to chapter no longer fails to save, or saves with only some of its pictures, when the site is slow to answer. Waypage scrolls the chapter until every picture is in (going back for any the site skipped), and a chapter that still comes up short says how many loaded and offers Try again, instead of being kept half done. Android only.
