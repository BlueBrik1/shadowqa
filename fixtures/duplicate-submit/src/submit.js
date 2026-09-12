export function createSubmitter(save) {
  let pending = false;
  return async function submit(value) {
    if (pending) return false;
    // Planted regression: the in-flight guard is never set.
    try { await save(value); return true; }
    finally { pending = false; }
  };
}
