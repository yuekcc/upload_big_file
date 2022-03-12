import { createBLAKE3 } from 'hash-wasm';

const CHUNK_SIZE = 2 * 1024 * 1024; // 2mb

interface Chunk {
  chunkIndex: number;
  chunk: Blob;
  sample: Blob[];
}

function fetchSample(blob: Blob): Blob[] {
  const len = blob.size;
  return [blob.slice(0, 2), blob.slice(len / 2, 2), blob.slice(len - 2)];
}

function makeFileChunks(file: File): Chunk[] {
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

interface Job {
  id: string;
  file: File;
  chunks: Chunk[];
  chunksLength: number;
  hash: string;
  sampleHash: string;
  options: Record<string, any>;
}

async function makeUploadJob(file: File, options: Record<string, any>): Promise<Job> {
  const chunks = makeFileChunks(file);

  const result: Job = {
    id: crypto.randomUUID(),
    file,
    chunks,
    chunksLength: chunks.length,
    hash: await makeFullFileHash(chunks),
    sampleHash: await makeSampledFileHash(chunks),
    options,
  };

  return result;
}

function makeGroup(list = [], size = 1) {
  const result = [];

  let cur = 0;
  while (cur < list.length) {
    result.push([...list.slice(cur, cur + size)]);
    cur += size;
  }

  return result;
}

// TODO 改用 Fetch
async function sendChunkInGroups(endpoint: string, group = []): Promise<void> {
  return new Promise(resolve =>
    setTimeout(() => {
      const ids = group.map(it => it.chunkIndex);
      console.log('#sendChunkInGroups', ids);
      resolve();
    }, 1000),
  );
}

const jobList: Record<string, Job> = {};

async function addJob(file, options): Promise<void> {
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

  const maxSender = job.options.maxSender || 3;
  const endpoint = job.options.endpoint;

  const groupedChunk = makeGroup(job.chunks, maxSender);
  console.log('groupedChunk', groupedChunk);

  for (const group of groupedChunk) {
    await sendChunkInGroups(endpoint, group);
    postMessage({
      name: 'process',
      data: { groupsCount: groupedChunk.length, uploadedIds: group.map(it => it.chunkIndex) },
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

interface UploadMessage {
  name: string;
  file?: File;
  jobId?: string;
  options?: { maxSender: number; endpoint: string };
}

onmessage = async function (e: MessageEvent<UploadMessage>) {
  const { name, jobId, file, options } = e.data || {};

  if (name === 'select_file') {
    addJob(file!, options!);
    return;
  }

  if (name === 'start_upload') {
    startUpload(jobId);
    return;
  }
};
