import { createBLAKE3 } from 'hash-wasm';

const CHUNK_SIZE = 2 * 1024 * 1024; // 2mb
const DEFAULT_MAX_SENDER = 4;

interface Chunk {
  chunkIndex: number;
  chunk: Blob;
  sample: Blob[];
}

interface UploadOptions {
  maxSender?: number;
  endpoint: string;
}

interface UploadMessage {
  name: string;
  file?: File;
  jobId?: string;
  options?: UploadOptions;
}

interface Job {
  id: string;
  file: File;
  chunks: Chunk[];
  chunksLength: number;
  hash: string;
  sampleHash: string;
  options: UploadOptions;
}

function fetchSample(blob: Blob): Blob[] {
  const len = blob.size;
  return [blob.slice(0, 2), blob.slice(len / 2, 2), blob.slice(len - 2)];
}

function makeFileChunks(file: Blob): Chunk[] {
  const list: Chunk[] = [];
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

async function hash(blobs: Blob[]): Promise<string> {
  const builder = await createBLAKE3();
  builder.init();

  for (const it of blobs) {
    const buf = await it.arrayBuffer();
    builder.update(new Uint8Array(buf));
  }

  return builder.digest('hex');
}

async function makeFullFileHash(chunkList: Chunk[]): Promise<string> {
  return hash(chunkList.map(it => it.chunk));
}

async function makeSampledFileHash(chunkList: Chunk[]): Promise<string> {
  return hash(chunkList.map(it => it.sample).flat(Infinity) as Blob[]);
}



async function makeUploadJob(file: File, options: UploadOptions): Promise<Job> {
  const chunks = makeFileChunks(file);

  const sampleHash = await makeSampledFileHash(chunks);
  const hash = await makeFullFileHash(chunks);

  const result: Job = {
    id: hash,
    file,
    chunks,
    chunksLength: chunks.length,
    hash,
    sampleHash,
    options,
  };

  return result;
}

function splitGroups<T>(list: Array<T>, size: number): Array<Array<T>> {
  const result: Array<Array<T>> = [];

  let cur = 0;
  while (cur < list.length) {
    result.push([...list.slice(cur, cur + size)]);
    cur += size;
  }

  return result;
}

// TODO 改用 Fetch
async function sendChunks(endpoint: string, chunks: Chunk[]): Promise<void> {
  return new Promise(resolve =>
    setTimeout(() => {
      const ids = chunks.map(it => it.chunkIndex);
      console.log('#sendChunkInGroups', endpoint, ids);
      resolve();
    }, 500),
  );
}

const jobList: Record<string, Job> = {};

async function addJob(file: File, options: UploadOptions): Promise<void> {
  const job = await makeUploadJob(file, options);
  // TODO 处理重复上传
  jobList[job.hash] = job;

  postMessage({
    name: 'ready',
    data: {
      id: job.id,
      filename: job.file.name,
      chunksLength: job.chunksLength,
      hash: job.hash,
      sampleHash: job.sampleHash,
    },
  });
}

async function startUpload(jobId: string) {
  const ts = Date.now();
  const job = jobList[jobId];

  const maxSender = job.options.maxSender || DEFAULT_MAX_SENDER;
  const endpoint = job.options.endpoint;

  const grouped = splitGroups(job.chunks, maxSender);

  for (const group of grouped) {
    await sendChunks(endpoint, group);
    postMessage({
      name: 'process',
      data: { groupsLength: grouped.length, uploadedIds: group.map(it => it.chunkIndex) },
    });
  }

  const usageInMs = Math.ceil(Date.now() - ts);
  postMessage({
    name: 'finish',
    data: { usage: usageInMs },
  });

  setTimeout(() => {
    delete jobList[jobId];
    console.log('remove job, jobId=', jobId);
  });
}

onmessage = function (e: MessageEvent<UploadMessage>) {
  const { name, jobId, file, options } = e.data || {};

  if (name === 'select_file' && file && options) {
    addJob(file, options);
    return;
  }

  if (name === 'start_upload' && jobId) {
    startUpload(jobId);
    return;
  }
};
