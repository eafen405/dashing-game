# Web bundle measurement and reduction

Type: task
Status: resolved

## Answer

Before: 2,325,570 bytes / gzip 1,223,459. The 26 original inline image data URLs
accounted for 1,167,086 bytes. Their source files remain unchanged.

Use LazyMotion with domAnimation and the small React components. Removed unused
drag/layout animation features. Production output is approximately 2,276,997
bytes, a 48,573-byte reduction; exact final bytes are in dist/bundle-report.json.

ADR-0009 keeps the existing code warning limits and adds a bounded artwork
budget. Complete-file size and both components remain visible. New regression
checks verify code inflation and image inflation are both still reported.
