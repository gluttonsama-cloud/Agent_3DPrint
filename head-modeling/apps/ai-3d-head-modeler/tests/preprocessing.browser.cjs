// 运行前启动 Vite；测试浏览器依赖由本机工具提供，所有 API 请求均被拦截。
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.TEST_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let submitted;
    let removal = 'failure';
    let removalCalls = 0;
    let png;
    await page.route('**/api/**', async route => {
      const url = route.request().url();
      if (url.endsWith('/remove-background/inline')) {
        removalCalls++;
        // 延迟响应，验证处理中禁止提交、离开后丢弃结果。
        await new Promise(resolve => setTimeout(resolve, 300));
        return route.fulfill({ status: removal === 'failure' ? 503 : 200,
          json: removal === 'failure'
            ? { success: false, message: '尚未配置抠图服务' }
            : { success: true, image: png } });
      }
      if (url.endsWith('/upload/base64')) {
        submitted = route.request().postDataJSON();
        return route.fulfill({ status: 200,
          json: { success: true, taskId: 'task-test-preprocessing' } });
      }
      return route.fulfill({ status: 200,
        json: { success: true, status: 'IN_PROGRESS', progress: 10 } });
    });
    await page.goto('http://localhost:4173/#/upload');
    await page.waitForLoadState('networkidle');
    assert.ok((await page.locator('h1').innerText()).includes('上传'));
    png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 1200;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#dd4422'; ctx.fillRect(200, 200, 400, 800);
      return canvas.toDataURL('image/png');
    });
    const file = { name: 'portrait.png', mimeType: 'image/png',
      buffer: Buffer.from(png.split(',')[1], 'base64') };
    const input = page.locator('input[type=file]');
    await input.setInputFiles(file);
    await page.getByRole('button', { name: '检查与处理照片' }).click();
    const confirm = page.getByRole('button', { name: /确认.*张照片并开始建模/ });
    await confirm.waitFor();
    const preview = page.getByAltText('正面照处理结果');
    const dimensions = () => preview.evaluate(img => [img.naturalWidth, img.naturalHeight]);
    assert.deepEqual(await dimensions(), [800, 1200]);
    const first = await preview.getAttribute('src');
    const corner = await preview.evaluate(img => {
      const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data);
    });
    assert.ok(corner.slice(0, 3).every(value => value >= 250), '透明像素必须填白');
    async function openCrop() {
      await page.getByRole('button', { name: '裁剪照片', exact: true }).click();
      await page.getByAltText('裁剪操作图').waitFor();
    }
    async function dragHandle(label, dx, dy) {
      const imageBox = await page.getByAltText('裁剪操作图').boundingBox();
      const handle = await page.getByLabel(label, { exact: true }).boundingBox();
      const x = handle.x + handle.width / 2;
      const y = handle.y + handle.height / 2;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + imageBox.width * dx, y + imageBox.height * dy, { steps: 8 });
      await page.mouse.up();
    }
    await openCrop();
    assert.equal(await page.getByRole('button', { name: '等待图片处理完成' }).isDisabled(), true);
    await dragHandle('调整上边', 0, 0.25);
    await page.getByRole('button', { name: '取消裁剪' }).click();
    assert.equal(await preview.getAttribute('src'), first, '取消不能改变已确认结果');
    await openCrop();
    await dragHandle('调整上边', 0, 0.25);
    await page.getByRole('button', { name: '应用裁剪' }).click();
    await page.waitForFunction(() => {
      const img = document.querySelector('img[alt="正面照处理结果"]');
      return img && Math.abs(img.naturalHeight - 900) <= 2;
    });
    assert.ok(Math.abs((await dimensions())[1] - 900) <= 2);
    await page.getByRole('button', { name: '顺时针旋转 90°' }).click();
    await page.waitForFunction(() => {
      const img = document.querySelector('img[alt="正面照处理结果"]');
      return img?.naturalWidth === 1200;
    });
    assert.deepEqual(await dimensions(), [1200, 800]);
    await page.getByRole('button', { name: '恢复原图' }).click();
    await page.waitForFunction(first =>
      document.querySelector('img[alt="正面照处理结果"]')?.getAttribute('src') === first, first);
    await openCrop();
    await page.getByRole('button', { name: '正方形', exact: true }).click();
    await page.getByRole('button', { name: '应用裁剪' }).click();
    await confirm.waitFor();
    let size = await dimensions();
    assert.ok(Math.abs(size[0] - size[1]) <= 2, '正方形应按像素比例裁剪');
    await openCrop();
    assert.deepEqual(await page.getByAltText('裁剪操作图')
      .evaluate(img => [img.naturalWidth, img.naturalHeight]), [800, 1200],
    '重复裁剪必须仍显示完整处理基图');
    await page.getByRole('button', { name: '3:4', exact: true }).click();
    const selection = page.getByLabel('移动裁剪选区', { exact: true });
    const beforeMove = await selection.boundingBox();
    await page.mouse.move(beforeMove.x + beforeMove.width / 2, beforeMove.y + beforeMove.height / 2);
    await page.mouse.down();
    await page.mouse.move(beforeMove.x + beforeMove.width / 2,
      beforeMove.y + beforeMove.height / 2 + 15, { steps: 5 });
    await page.mouse.up();
    assert.ok((await selection.boundingBox()).y > beforeMove.y + 10, '框内拖拽应移动选区');
    await page.getByRole('button', { name: '应用裁剪' }).click();
    await confirm.waitFor();
    size = await dimensions();
    assert.ok(Math.abs(size[0] / size[1] - 0.75) < 0.003);
    await page.getByRole('button', { name: '查看原图', exact: true }).click();
    assert.equal(await page.getByAltText('正面照原图').isVisible(), true);
    assert.equal(await preview.isVisible(), false);
    await page.getByRole('button', { name: '处理结果', exact: true }).click();
    assert.equal(await preview.isVisible(), true);
    await page.getByRole('button', { name: '恢复原图' }).click();
    await confirm.waitFor();
    // 窄屏使用浏览器原生触摸事件拖拽角点，检查滚动与图片坐标一致。
    await page.setViewportSize({ width: 390, height: 844 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await openCrop();
    const cornerHandle = page.getByLabel('调整右下角', { exact: true });
    await cornerHandle.scrollIntoViewIfNeeded();
    const cornerBox = await cornerHandle.boundingBox();
    const point = { x: cornerBox.x + cornerBox.width / 2,
      y: cornerBox.y + cornerBox.height / 2, id: 1 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ ...point, x: point.x - 40, y: point.y - 60 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.TEST_CROP_SCREENSHOT) await page.screenshot({
      path: process.env.TEST_CROP_SCREENSHOT, fullPage: true });
    await page.getByRole('button', { name: '应用裁剪' }).click();
    await confirm.waitFor();
    size = await dimensions();
    assert.ok(size[0] < 790 && size[1] < 1190, '触摸角点拖动必须更新实际裁剪尺寸');
    await page.getByRole('button', { name: '恢复原图' }).click();
    await confirm.waitFor();
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await page.setViewportSize({ width: 1100, height: 900 });
    await page.getByRole('button', { name: '移除背景', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '等待图片处理完成' }).isDisabled(), true);
    await page.getByRole('alert').waitFor();
    assert.equal(await preview.getAttribute('src'), first, '抠图失败保留当前结果');
    assert.equal(await confirm.isEnabled(), true);
    removal = 'success';
    await page.getByRole('button', { name: '移除背景', exact: true }).click();
    await page.getByText('建模输入 · 已抠图／白底').waitFor();
    await confirm.waitFor();
    await page.getByRole('button', { name: '返回选择照片' }).click();
    await page.getByRole('button', { name: '检查与处理照片' }).waitFor();
    assert.equal(await page.getByAltText('正面照').count(), 1, '返回重选保留原图');
    await page.getByRole('button', { name: '检查与处理照片' }).click();
    await confirm.waitFor();
    assert.equal(await page.getByText('建模输入 · 已抠图／白底').count(), 1,
      '返回补图后应保留已付费抠图结果');
    // 最终提交精确匹配最新预览，且单图不再误用多视图模式。
    await openCrop();
    await dragHandle('调整左边', 0.1, 0);
    await page.getByRole('button', { name: '应用裁剪' }).click();
    await page.waitForFunction(() => {
      const img = document.querySelector('img[alt="正面照处理结果"]');
      return img && Math.abs(img.naturalWidth - 720) <= 2;
    });
    const latest = await preview.getAttribute('src');
    if (process.env.TEST_SCREENSHOT) await page.screenshot({
      path: process.env.TEST_SCREENSHOT, fullPage: true });
    await confirm.click();
    await page.waitForURL('**/#/processing');
    assert.equal(submitted.photos[0], latest.split(',')[1]);
    assert.equal(submitted.mode, 'single');
    assert.deepEqual(submitted.views, ['正面照']);
    assert.equal(removalCalls, 2);

    // EXIF Orientation=6：横向存储的手机 JPEG 应显示为竖图。
    const jpegUrl = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
      return canvas.toDataURL('image/jpeg');
    });
    const jpeg = Buffer.from(jpegUrl.split(',')[1], 'base64');
    const exif = Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000', 'hex');
    const oriented = Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
    await page.goto('http://localhost:4173/#/upload');
    await input.setInputFiles({ name: 'phone.jpg', mimeType: 'image/jpeg', buffer: oriented });
    await page.getByRole('button', { name: '检查与处理照片' }).click();
    await confirm.waitFor();
    assert.deepEqual(await dimensions(), [600, 800], '应应用手机 EXIF 方向');
    // 在抠图返回前离开，下一张原图不能被旧结果污染。
    await page.getByRole('button', { name: '移除背景', exact: true }).click();
    await page.getByRole('button', { name: '返回选择照片' }).click();
    await page.getByRole('button', { name: '检查与处理照片' }).click();
    await confirm.waitFor();
    await page.waitForTimeout(500);
    assert.deepEqual(await dimensions(), [600, 800]);
    assert.equal(await page.getByText('建模输入 · 保留背景').count(), 1);
    // 多视图的排序、视角和最终图片一一对应。
    await page.getByRole('button', { name: '返回选择照片' }).click();
    await input.setInputFiles([file, { ...file, name: 'left.png' }]);
    await page.getByRole('button', { name: '检查与处理照片' }).click();
    await confirm.waitFor();
    const multiPreviews = await page.locator('img[alt$="处理结果"]')
      .evaluateAll(images => images.map(img => img.getAttribute('src').split(',')[1]));
    await confirm.click();
    await page.waitForURL('**/#/processing');
    assert.equal(submitted.mode, 'multiview');
    assert.deepEqual(submitted.views, ['正面照', '左侧照']);
    assert.deepEqual(submitted.photos, multiPreviews);
    // 无上下文的预处理链接安全返回上传，损坏图片禁止进入生成。
    await page.goto('http://localhost:4173/');
    await page.goto('http://localhost:4173/#/preprocess');
    await page.waitForURL('**/#/upload');
    await input.setInputFiles({ name: 'broken.png', mimeType: 'image/png',
      buffer: Buffer.from('broken-image') });
    await page.getByRole('button', { name: '检查与处理照片' }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('button', { name: '等待图片处理完成' }).isDisabled(), true);
    // 手机窄屏不能横向溢出。
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS: 方向、透明白底、拖拽裁剪及取消、旋转、重置、抠图失败/成功、返回保留、最新输入提交、旧响应隔离、多视图、损坏图片、空上下文、窄屏布局');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
