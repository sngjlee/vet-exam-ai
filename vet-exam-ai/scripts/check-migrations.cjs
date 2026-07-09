#!/usr/bin/env node

// Migration guard. After the 2026-07-09 consolidation there is a SINGLE
// authoritative migration tree at vet-exam-ai/supabase/migrations. This script
// validates that tree (filename pattern, unique 14-digit timestamps) and fails
// if a second tree ever reappears at the workspace-root supabase/migrations
// (the retired legacy location), so migrations can't silently diverge again.

const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const activeDir = path.join(appRoot, "supabase", "migrations");
const retiredDir = path.join(repoRoot, "supabase", "migrations");

function fail(message) {
  console.error(`migration-check: ${message}`);
  process.exitCode = 1;
}

function readMigrations(dir) {
  if (!fs.existsSync(dir)) {
    fail(`missing migrations directory: ${path.relative(repoRoot, dir)}`);
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const match = name.match(/^(\d{14})_(.+)\.sql$/);
      if (!match) {
        fail(`invalid migration filename: ${path.relative(repoRoot, path.join(dir, name))}`);
      }
      return {
        name,
        timestamp: match?.[1] ?? "",
        path: path.join(dir, name),
      };
    });
}

function checkDuplicateTimestamps(label, migrations) {
  const seen = new Map();
  for (const migration of migrations) {
    if (!migration.timestamp) continue;
    const previous = seen.get(migration.timestamp);
    if (previous) {
      fail(
        `${label} has duplicate timestamp ${migration.timestamp}: ${previous.name}, ${migration.name}`,
      );
    }
    seen.set(migration.timestamp, migration);
  }
}

function latestTimestamp(migrations) {
  return migrations.reduce(
    (latest, migration) =>
      migration.timestamp && migration.timestamp > latest ? migration.timestamp : latest,
    "",
  );
}

const active = readMigrations(activeDir);

checkDuplicateTimestamps("active migrations", active);

if (active.length === 0) {
  fail("active migrations directory has no timestamped SQL files");
}

// No-second-tree guard. The workspace-root supabase/migrations was retired in
// the consolidation; any .sql reappearing there means a divergent second tree.
if (fs.existsSync(retiredDir)) {
  const strays = fs
    .readdirSync(retiredDir)
    .filter((name) => name.endsWith(".sql"));
  if (strays.length > 0) {
    fail(
      [
        `retired root supabase/migrations must stay empty (found ${strays.length} .sql).`,
        "All migrations live in vet-exam-ai/supabase/migrations only.",
        `Offending file(s): ${strays.join(", ")}`,
      ].join(" "),
    );
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `migration-check: ok (${active.length} migrations; latest ${latestTimestamp(active)})`,
);
