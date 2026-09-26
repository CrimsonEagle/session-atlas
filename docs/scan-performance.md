# Scan Performance

Status: September 14, 2026. The optimization builds on the fixes for detecting newly written logs and session-wide Codex deduplication.

## Cause and Changes

The previous scanner opened every discovered file, called `handle.stat()`, and closed it again—even for completely unchanged logs. These accesses ran sequentially. For changed files, it also deep-copied all historical events and performed hash updates for every individual line while reading.

The optimized scanner:

- checks cached files with `fs.stat()` first and opens them only when they have changed;
- processes no more than four files concurrently and applies the results in their original order so duplicate selection does not change nondeterministically;
- processes identical paths found in multiple source folders only once;
- shares concurrent repository-resolution requests for the same working directory;
- copies only the parser-event containers when appending because the parser replaces their entries; this also preserves old state when errors occur;
- reads with 512 KiB buffers, avoids unnecessary buffer copies, and updates the hash for complete lines once per buffer.

The full SHA-256 verification of the already-read prefix of changed files remains in place. No sampling is used. Verification and reading use the same file handle. Newly imported file states also store `ctime`, the file identifier, and the device and include them when detecting unchanged files. Existing version 3 caches remain readable; missing additional metadata is added on the next file import.

## Benchmark

Synthetic data: 193 JSONL files, 16,384 events, approximately 30.7 MiB. For the append case, one file of approximately 9.2 MiB grows by one event. The benchmark ran on Windows in the same working environment with the previous and optimized implementations; the execution order alternated between runs.

| Scenario | Previous, total time | Optimized, total time | Previous, UI scan time | Optimized, UI scan time |
| --- | ---: | ---: | ---: | ---: |
| Initial import without application cache | 258.28 ms | 145.34 ms | 230 ms | 127 ms |
| Subsequent refresh without changes | 63.78 ms | 9.03 ms | 59 ms | 4 ms |
| First scan after loading the cache | 61.32 ms | 9.72 ms | 57 ms | 4 ms |
| Subsequent refresh with an appended response | 94.06 ms | 41.78 ms | 79 ms | 26 ms |

Median of three runs each; for unchanged files, 21 scans. Total time includes `Store.scan()`, including cache writes and snapshot generation. The existing UI metric `stats.durationMs` ends before those two steps; its meaning has not changed. Loading the cache before the restart scenario is not included in the reported scan time. HTTP transfer and browser rendering are also excluded.

“Initial import” means an empty application cache, not a cold operating-system file cache. These values describe this synthetic comparison and are not a guarantee for other computers or data volumes. Both implementations read the same amounts: 0 bytes for unchanged files and the full relevant prefix for the append case. The normalized session content, including events and costs, was identical in all compared runs.

## Reproducing the Benchmark

```powershell
node scripts/benchmark-scan.mjs
```

An optional argument lets you compare against a second store implementation:

```powershell
node scripts/benchmark-scan.mjs C:\Path\to\comparison-version\store.mjs
```

The comparison file must export `Store` and correctly resolve its relative imports. The benchmark creates only synthetic logs and cache files in a dedicated temporary folder and removes it afterward. Personal session files and the running server are not used.

## Safeguards and Limitations

The full test suite passes with 51 tests. Additional regression tests cover hashes spanning multiple buffers with malformed lines and split UTF-8 characters, changes in the middle of a growing log after a cache restart, preservation of unchanged old state when file updates fail, and deterministic duplicate handling despite overlapping source folders and different completion times.

Detection of unchanged files still relies on file-system metadata. A content change that leaves all compared metadata unchanged cannot be detected without reading the file again. The optimization does not weaken the previous verification; additional metadata improves it for newly imported states.

For very large and rapidly growing logs, full prefix verification still requires work proportional to the file size already read. Replacing it with sampling alone would weaken detection of changes in the middle of a file. Very large datasets can also remain constrained by writing the entire JSON cache and generating snapshots.

The running server must be restarted after a code update. If the server is already running, invoking `Start.cmd` on Windows or `Start.sh` on Linux again only opens the existing instance. To apply changes, first use “Exit App Completely,” then start it again.
