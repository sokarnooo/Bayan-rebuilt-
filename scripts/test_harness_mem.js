import { spawn } from 'child_process';

const server = spawn('node', ['--expose-gc', 'dist-server/server.js'], {
  env: { ...process.env, PORT: '3099', NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

server.stdout.on('data', (d) => {
  const msg = d.toString();
  if (msg.includes('Bayan Server listening')) {
    console.log('Production server started.');
    runHarness();
  }
});

server.stderr.on('data', (d) => console.error(d.toString()));

async function getRss() {
  try {
    const res = await fetch('http://localhost:3099/api/health');
    const data = await res.json();
    return data;
  } catch (e) {
    return null;
  }
}

function runHarness() {
  setTimeout(() => {
    // Measure idle
    const evalProc = spawn('npx', ['tsx', 'eval/run.ts', 'http://localhost:3099', '--quiet', '--concurrency', '1'], {
      stdio: 'inherit',
    });

    evalProc.on('exit', async (code) => {
      console.log('Evaluation finished with exit code:', code);
      // Give server 1 second to settle and read process memory
      setTimeout(() => {
        // Query server memory from outside
        import('child_process').then(({ execSync }) => {
          try {
            const out = execSync(`ps -o rss= -p ${server.pid}`).toString().trim();
            const rssMb = Math.round(parseInt(out, 10) / 1024);
            console.log('====================================');
            console.log(`PRODUCTION SERVER ACTIVE RSS AFTER HARNESS: ${rssMb} MB`);
            console.log('====================================');
          } catch (e) {
            console.error('Error reading PID RSS:', e);
          }
          server.kill();
          process.exit(0);
        });
      }, 1000);
    });
  }, 2000);
}
