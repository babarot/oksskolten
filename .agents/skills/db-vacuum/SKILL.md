---
name: db-vacuum
description: VACUUM the SQLite database to reclaim disk space and consolidate WAL
user_invocable: true
---

Run VACUUM on the project's SQLite database to defragment and reclaim unused space.
This is especially useful after schema migrations (ALTER TABLE) which can bloat the WAL file.

## Steps

1. Show current DB and WAL file sizes
2. Run `VACUUM` via sqlite3
3. Show file sizes after to confirm reclamation

## Commands

```bash
# 1. Before
ls -lh data/rss.db*

# 2. VACUUM
sqlite3 data/rss.db "VACUUM;"

# 3. After
ls -lh data/rss.db*
```
