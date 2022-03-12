let uploadWorker = null;
if (!uploadWorker) {
  uploadWorker = new Worker('dist/hashing_worker.js');
}

let jobId = null;

uploadWorker.onmessage = function (e) {
  const { name, data } = e.data;
  console.log(name, data);

  if (name === 'ready') {
    jobId = data.hash;
  }

  if (name === 'finish') {
    jobId = null;
  }
};

async function selectFile(e) {
  const [file] = e.target.files;

  uploadWorker.postMessage({
    name: 'select_file',
    file,
    options: {
      maxSender: 3,
      endpoint: '/upload',
    },
  });
}

function sendFile() {
  if (!jobId) {
    console.log('select file first');
    return;
  }

  uploadWorker.postMessage({
    name: 'start_upload',
    jobId,
  });
}

document.getElementById('file').addEventListener('change', selectFile);
document.getElementById('send').addEventListener('click', sendFile);
