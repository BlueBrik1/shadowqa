import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { testDb } from "./individual-helpers.js";

/**
 * Point the individual home at a throwaway directory before anything reads it.
 *
 * `workRoot()` defaults to `~/.shadowqa-individual`, which is the user's real data directory:
 * their database, their tokens and their agent workspaces. Tests that prepare a workspace must
 * never write there, so each worker gets its own temporary home instead.
 */
process.env.SHADOWQA_INDIVIDUAL_HOME ??= mkdtempSync(
  path.join(tmpdir(), "shadowqa-test-home-"),
);

/**
 * Boots this worker's embedded PostgreSQL before any test runs.
 *
 * The engine is a WebAssembly build and takes a second or so to come up — longer on a machine that
 * is busy doing something else. Booting it lazily inside the first test charged that time to that
 * test's timeout, which made the suite fail under load for a reason that had nothing to do with the
 * code under test. Paying for it here, once per worker, keeps the timings honest.
 */
await testDb();
