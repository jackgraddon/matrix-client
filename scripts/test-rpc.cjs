const net = require('net');
const path = require('path');
const os = require('os');

const platform = os.platform();
const BASE_PATH = platform === 'win32' ? '\\\\?\\pipe\\discord-ipc'
  : path.join(process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || '/tmp', 'discord-ipc');

async function tryConnect() {
  for (let i = 0; i < 10; i++) {
    const socketPath = platform === 'win32' ? `${BASE_PATH}-${i}` : `${BASE_PATH}-${i}`;
    console.log(`Trying to connect to ${socketPath}...`);

    try {
      const client = await new Promise((resolve, reject) => {
        const conn = net.createConnection(socketPath);
        conn.on('connect', () => resolve(conn));
        conn.on('error', (err) => reject(err));
        // Timeout after 1s
        setTimeout(() => reject(new Error('Timeout')), 1000);
      });

      console.log(`Connected to arRPC on socket ${i}!`);
      setupClient(client);
      return;
    } catch (err) {
      console.log(`Failed to connect to socket ${i}: ${err.message}`);
    }
  }

  console.error('Could not connect to any arRPC socket (0-9).');
  console.log('Make sure the Tumult app is running and Game Activity is enabled in settings.');
  process.exit(1);
}

function setupClient(client) {

const Types = {
  HANDSHAKE: 0,
  FRAME: 1,
};

function encode(type, data) {
  const json = JSON.stringify(data);
  const dataSize = Buffer.byteLength(json);
  const buf = Buffer.alloc(dataSize + 8);
  buf.writeInt32LE(type, 0);
  buf.writeInt32LE(dataSize, 4);
  buf.write(json, 8, dataSize);
  return buf;
}

  // 1. Send Handshake
  console.log('Sending Handshake...');
  client.write(encode(Types.HANDSHAKE, {
    v: 1,
    client_id: '123456789012345678'
  }));

  client.on('data', (data) => {
  const type = data.readInt32LE(0);
  const size = data.readInt32LE(4);
  const body = JSON.parse(data.slice(8, 8 + size).toString());

  console.log('Received:', body.evt || body.cmd);

  if (body.evt === 'READY') {
    console.log('Authenticated! Sending Activity...');

    // 2. Send Activity
    client.write(encode(Types.FRAME, {
      cmd: 'SET_ACTIVITY',
      args: {
        pid: process.pid,
        activity: {
          details: 'Testing arRPC Integration',
          state: 'It works!',
          timestamps: {
            start: Date.now()
          },
          assets: {
            large_image: 'ruby',
            large_text: 'Tumult'
          },
          buttons: [
            { label: 'View Source', url: 'https://github.com/OpenAsar/arrpc' }
          ]
        }
      },
      nonce: 'test-123'
    }));

    console.log('Activity sent. Check your app UI!');
    console.log('Keeping connection open for 30 seconds...');
    setTimeout(() => {
        console.log('Closing test...');
        client.end();
        process.exit(0);
    }, 30000);
  }
});

  client.on('error', (err) => {
    console.error('Client error:', err.message);
    process.exit(1);
  });
}

tryConnect();
