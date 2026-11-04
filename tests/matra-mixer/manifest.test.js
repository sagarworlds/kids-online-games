import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildManifest, missingClips } from '../../scripts/matra-audio-manifest.mjs';

/** Makes a recordings folder with the given files, runs the test body, and cleans up. */
async function withFolder(files, body) {
  const root = await mkdtemp(join(tmpdir(), 'matra-audio-'));
  try {
    for (const lang of ['hi', 'mr']) await mkdir(join(root, lang), { recursive: true });
    for (const file of files) await writeFile(join(root, file), '');
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('the manifest lists the recordings of each language, sorted, and reports files named wrongly', async () => {
  await withFolder(['hi/k-aa.mp3', 'hi/k-a.ogg', 'hi/.gitkeep', 'hi/ka.mp3', 'mr/m-i.wav', 'mr/notes.txt'], async (root) => {
    const { manifest, ignored } = await buildManifest(root);
    assert.deepEqual(manifest, { hi: ['k-a.ogg', 'k-aa.mp3'], mr: ['m-i.wav'] });
    assert.deepEqual(ignored.sort(), ['hi/ka.mp3', 'mr/notes.txt']);
  });
});

test('an empty or missing folder gives an empty manifest', async () => {
  await withFolder([], async (root) => assert.deepEqual((await buildManifest(root)).manifest, { hi: [], mr: [] }));
  assert.deepEqual((await buildManifest(join(tmpdir(), 'matra-no-such-folder'))).manifest, { hi: [], mr: [] });
});

test('missingClips counts the syllables with no recording yet', async () => {
  const all = missingClips({ hi: [], mr: [] }, 'hi');
  assert.equal(all.length, 34 * 14, 'every consonant with all 14 signs');
  assert.ok(all.includes('k-aa') && all.includes('tr-ao'));
  const some = missingClips({ hi: ['k-aa.mp3', 'k-a.ogg'], mr: [] }, 'hi');
  assert.equal(some.length, all.length - 2);
  assert.ok(!some.includes('k-aa'));
  assert.equal(missingClips({ hi: [], mr: [] }, 'mr').length, 35 * 14);
  assert.ok(missingClips({ hi: [], mr: [] }, 'mr').includes('ll-aa'));
});
