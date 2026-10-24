const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { serverFixture } = require('./helpers/server-fixture.cjs');

async function run() {
  const fixture = await serverFixture();
  const output = path.resolve(process.env.INFOBOARD_SMOKE_OUTPUT_DIR || path.join(__dirname, '../artifacts/browser-smoke'));
  fs.mkdirSync(output, { recursive: true });
  try {
    for (const [width, height] of [[1366, 768], [1600, 900], [1920, 1080]]) {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(__dirname, 'browser-smoke.cjs'),
          fixture.url, String(width), String(height)], {
          env: { ...process.env, INFOBOARD_SMOKE_OUTPUT_DIR: output }, windowsHide: true
        });
        let stdout = '', stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; });
        child.stderr.on('data', chunk => { stderr += chunk; });
        child.on('error', reject);
        child.on('close', code => resolve({ code, stdout, stderr }));
      });
      fs.writeFileSync(path.join(output, `smoke-${width}x${height}.json`), result.stdout);
      if (result.stderr) fs.writeFileSync(path.join(output, `smoke-${width}x${height}.stderr.log`), result.stderr);
      console.log(`${width}x${height}: ${result.code === 0 ? 'PASS' : 'FAIL'}`);
      if (result.code !== 0) throw new Error(`Smoke falhou; consulte os artefatos em ${output}`);
    }
  } finally {
    await fixture.close();
  }
}

run().catch(error => { console.error(error.message); process.exitCode = 1; });
