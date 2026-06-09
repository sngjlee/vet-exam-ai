#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "..");
const activeDir = path.join(appRoot, "supabase", "migrations");
const legacyDir = path.join(repoRoot, "supabase", "migrations");

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
const legacy = readMigrations(legacyDir);

checkDuplicateTimestamps("active migrations", active);
checkDuplicateTimestamps("legacy migrations", legacy);

const latestActive = latestTimestamp(active);
const latestLegacy = latestTimestamp(legacy);

if (!latestActive) {
  fail("active migrations directory has no timestamped SQL files");
}

if (latestLegacy && latestLegacy > latestActive) {
  const offenders = legacy
    .filter((migration) => migration.timestamp > latestActive)
    .map((migration) => path.relative(repoRoot, migration.path));
  fail(
    [
      "legacy root supabase/migrations is newer than vet-exam-ai/supabase/migrations.",
      "New migrations must be created under vet-exam-ai/supabase/migrations only.",
      `Offending file(s): ${offenders.join(", ")}`,
    ].join(" "),
  );
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log(
  `migration-check: ok (${active.length} active, ${legacy.length} legacy; latest active ${latestActive})`,
);
