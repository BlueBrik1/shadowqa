import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSubmitter } from '../src/submit.js';
test('duplicate submissions save exactly once while a request is pending', async () => {
  let release; let calls = 0;
  const wait = new Promise(resolve => { release = resolve; });
  const submit = createSubmitter(async () => { calls++; await wait; });
  const first = submit('same');
  const second = submit('same');
  release();
  assert.deepEqual(await Promise.all([first, second]), [true, false]);
  assert.equal(calls, 1);
});
test('a later submission succeeds after the first completes', async () => {
  let calls = 0;
  const submit = createSubmitter(async () => { calls++; });
  assert.equal(await submit('one'), true);
  assert.equal(await submit('two'), true);
  assert.equal(calls, 2);
});
