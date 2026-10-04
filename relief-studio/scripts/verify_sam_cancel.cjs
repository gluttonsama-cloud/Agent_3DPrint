// 替换启动脚本以附加观测点，其余复用真实主体运行器与 SAM 推理。
const fs = require('node:fs/promises');
const path = require('node:path');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');

async function main() {
  const root = path.resolve(__dirname, '..');
  if (!process.argv[2]) throw new Error('需要一个尚不存在的证据目录');
  const directory = path.resolve(process.argv[2]);
  await fs.mkdir(directory);
  const originalSpawn = cp.spawn;
  const children = [];
  cp.spawn = (command, args, options) => {
    const child = originalSpawn(command, [path.join(__dirname, 'verify_sam_worker.py'), ...args.slice(1)],
      { ...options, env: { ...options.env, RELIEF_SAM_PROBE: directory } });
    children.push(child); return child;
  };
  const runtime = require('../electron/subject.cjs')({ isPackaged: false }, root);
  cp.spawn = originalSpawn;
  const image = cp.execFileSync(path.join(root, '.venv/Scripts/python.exe'), ['-c',
    'from PIL import Image,ImageDraw;import io,base64;im=Image.new("RGB",(512,512),"white");ImageDraw.Draw(im).ellipse((80,80,430,430),fill="red");b=io.BytesIO();im.save(b,format="PNG");print("data:image/png;base64,"+base64.b64encode(b.getvalue()).decode())'], { encoding: 'utf8' }).trim();
  const job = { action: 'predict', image, points: [{ x: 256, y: 256, label: 1 }] };
  let settled = false;
  const pending = runtime.request({ ...job, id: 'cancel' }).then(
    value => { settled = true; return { value }; },
    error => { settled = true; return { error: error.message }; });
  try {
    let marker;
    for (let attempt = 0; attempt < 24000 && !settled; attempt++) {
      try { marker = JSON.parse(await fs.readFile(path.join(directory, 'forward-start.json'), 'utf8')); break; }
      catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
      await delay(5);
    }
    assert.ok(marker?.allocatedBytes > 0 && marker.device.startsWith('cuda'));
    assert.equal(settled, false, '取消时真实推理必须尚未返回');
    const started = performance.now();
    await runtime.stop();
    const cancelMs = performance.now() - started;
    assert.match((await pending).error, /取消/);
    assert.throws(() => process.kill(marker.pid, 0));
    const recovered = await runtime.request({ ...job, id: 'recover' });
    assert.equal(recovered.ok, true);
    assert.match(recovered.mask, /^data:image\/png;base64,/);
    const mask = cp.execFileSync(path.join(root, '.venv/Scripts/python.exe'), ['-c',
      'from PIL import Image;import io,base64,sys,json;im=Image.open(io.BytesIO(base64.b64decode(sys.stdin.read().split(",",1)[1])));print(json.dumps({"size":list(im.size),"bbox":im.getchannel("A").getbbox()}))'],
    { input: recovered.mask, encoding: 'utf8' });
    assert.deepEqual(JSON.parse(mask).size, [512, 512]);
    assert.ok(JSON.parse(mask).bbox);
    await runtime.shutdown();
    for (const child of children) assert.throws(() => process.kill(child.pid, 0));
    const report = { ...marker, cancelMs, recoveredMask: JSON.parse(mask), processCount: children.length,
      allExited: true, scope: 'real source SAM CUDA cancellation and restart; not packaged or quality acceptance' };
    await fs.writeFile(path.join(directory, 'verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await runtime.shutdown(); await pending; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
