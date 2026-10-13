const MAX_INPUT_BYTES = 3 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 12 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function failure(message, status) {
  return Object.assign(new Error(message), { status });
}

function decodeInput(image) {
  if (typeof image !== 'string') throw failure('请提供图片数据', 400);
  if (image.length > MAX_INPUT_BYTES * 4 / 3 + 64) {
    throw failure('抠图图片不能超过 3 MB', 413);
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match || match[2].length % 4 !== 0) throw failure('图片数据无效', 400);
  const bytes = Buffer.from(match[2], 'base64');
  const type = match[1];
  const valid = type === 'image/png' ? bytes.subarray(0, 8).equals(PNG_SIGNATURE)
    : type === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid || !bytes.length) throw failure('图片格式与内容不一致', 400);
  return { bytes, type };
}

async function readLimited(response) {
  if (Number(response.headers.get('content-length')) > MAX_OUTPUT_BYTES) {
    await response.body?.cancel();
    throw failure('抠图结果过大，请缩小图片后重试', 502);
  }
  if (!response.body) throw failure('抠图服务未返回图片', 502);
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_OUTPUT_BYTES) throw failure('抠图结果过大，请缩小图片后重试', 502);
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
}

// 独立的新入口遵循官方中国站协议，避免改动旧调用方及另一 agent 的建模链路。
async function removePortraitBackground(image, options = {}) {
  const input = decodeInput(image);
  const apiKey = options.apiKey ?? process.env.PICWISH_API_KEY;
  if (!apiKey || /^(YOUR_|your_|placeholder)/.test(apiKey)) {
    throw failure('尚未配置抠图服务，可保留背景继续建模', 503);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const form = new FormData();
  form.append('image_file', new Blob([input.bytes], { type: input.type }), 'portrait');
  for (const [key, value] of Object.entries({
    sync: '1', return_type: '3', output_type: '2', crop: '0', format: 'png', type: 'person',
  })) form.append(key, value);
  try {
    const response = await fetchImpl('https://techsz.aoscdn.com/api/tasks/visual/segmentation', {
      method: 'POST', headers: { 'X-API-KEY': apiKey }, body: form,
      signal: AbortSignal.timeout(65000), redirect: 'error',
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw failure('云端抠图失败，请检查服务配置及额度，或稍后重试', 502);
    }
    const bytes = await readLimited(response);
    if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
      throw failure('抠图服务未返回有效 PNG，请稍后重试', 502);
    }
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch (error) {
    if (error.status) throw error;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw failure('抠图超时，请稍后重试', 504);
    }
    // 不把上游请求对象、密钥或图片数据写入日志或返回客户端。
    throw failure('无法连接抠图服务，请稍后重试', 502);
  }
}

module.exports = { removePortraitBackground };
