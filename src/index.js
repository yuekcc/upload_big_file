import { createBLAKE3 } from 'hash-wasm';

const state = {
  file: null,
  chunks: null,
  hash: '',
  hashSampled: '',
};

const CHUNK_SIZE = 2 * 1024 * 1024; // 2mb

/**
 * 抽样，取中前中后各两个字节
 * @param {Blob} blob
 */
function fetchSample(blob) {
  const len = blob.size;
  return [blob.slice(0, 2), blob.slice(len / 2, 2), blob.slice(len - 2)];
}

function makeFileChunks(file) {
  const list = [];
  let cur = 0;
  let chunkIndex = 0;

  while (cur < file.size) {
    const chunk = file.slice(cur, cur + CHUNK_SIZE);
    let sample = chunkIndex === 0 ? [chunk] : fetchSample(chunk);
    list.push({ chunkIndex, chunk, sample });
    cur += CHUNK_SIZE;
    chunkIndex += 1;
  }

  return list;
}

/**
 *
 * @param {Array<Blob>} blobs
 * @returns {string}
 */
async function hash(blobs) {
  const builder = await createBLAKE3();
  builder.init();

  for (const it of blobs) {
    const buf = await it.arrayBuffer();
    builder.update(new Uint8Array(buf));
  }

  return builder.digest('hex');
}

async function makeFullFileHash(chunkList) {
  return hash(chunkList.map(it => it.chunk));
}

async function makeSampledFileHash(chunkList) {
  return hash(chunkList.map(it => it.sample).flat(Infinity));
}

async function selectFile(e) {
  const [file] = e.target.files;
  if (!file) {
    return;
  }

  console.time('calc hash');
  const chunks = makeFileChunks(file);
  state.file = file;
  state.chunks = chunks;
  state.hash = await makeFullFileHash(chunks);
  state.hashSampled = await makeSampledFileHash(chunks);

  console.log('full file hash: ', state.hash);
  console.log('sampled file hash: ', state.hashSampled);
  console.timeEnd('calc hash');
}

document.getElementById('file').addEventListener('change', selectFile);
