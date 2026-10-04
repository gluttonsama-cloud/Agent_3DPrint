import { test, expect, _electron as electron } from '@playwright/test';

function launchEnv(): Record<string, string> {
  const env = Object.fromEntries(Object.entries(process.env)
    .filter((entry): entry is [string, string] => entry[1] !== undefined));
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

test('工作台并排预览保留二维选区，顶部撤销恢复尺寸', async () => {
  const env = launchEnv();
  const app = await electron.launch({ args: [process.cwd()], env });
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.getByRole('button', { name: '打开示例工程', exact: true }).click();
    const canvas = page.getByLabel('图案编辑画布');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await expect(
      page.locator('.app-header').getByRole('button', {
        name: '导入图片',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .locator('.left-panel')
      .getByRole('button', {
        name: '框选',
        exact: true,
      })
      .click();
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
    await page.mouse.up();
    const count = page.getByTestId('selection-count');
    await expect(count).not.toHaveAttribute('data-count', '0');
    const selected = await count.getAttribute('data-count');
    await page.getByRole('button', { name: '3D 浮雕', exact: true }).click();
    await expect(page.locator('.right-panel .preview-host canvas')).toHaveCount(1);
    await expect(canvas).toBeVisible();
    await expect(count).toHaveAttribute('data-count', selected!);
    await page.screenshot({ path: 'artifacts/workbench/parallel-preview.png' });
    await page.locator('.sidebar-preview summary').click();
    await expect(page.locator('.preview-host canvas')).toHaveCount(0);
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await expect(count).toHaveAttribute('data-count', selected!);
    await page.keyboard.press('Control+d');
    await expect(count).toHaveAttribute('data-count', '0');
    const width = page.getByLabel('宽度', { exact: true });
    const original = await width.inputValue();
    await width.fill(String(Number(original) + 5));
    await width.press('Tab');
    await expect(
      page.locator('.app-header').getByRole('button', {
        name: '撤销',
        exact: true,
      }),
    ).toBeEnabled();
    await page
      .locator('.app-header')
      .getByRole('button', {
        name: '撤销',
        exact: true,
      })
      .click();
    await expect(width).toHaveValue(original);
    await page.setViewportSize({ width: 960, height: 760 });
    await page.getByRole('button', { name: '更多工具', exact: true }).click();
    const toolsBox = (await page.locator('.workspace-tools').boundingBox())!;
    const moreBox = (await page
      .getByRole('button', {
        name: '更多工具',
        exact: true,
      })
      .boundingBox())!;
    expect(moreBox.y + moreBox.height).toBeLessThanOrEqual(toolsBox.y + toolsBox.height);
    await expect(
      page.locator('.app-header').getByRole('button', {
        name: '导出分层',
        exact: true,
      }),
    ).toBeInViewport();
    await page.screenshot({ path: 'artifacts/workbench/compact-workbench.png' });
    expect(errors).toEqual([]);
  } finally {
    // 无论断言是否成功，都绕过未保存提示，避免测试清理阻塞。
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach(window => window.destroy());
    });
    await app.close();
  }
});

test('空格临时平移保持擦除工具，失焦与 Esc 取消未提交笔画', async () => {
  const env = launchEnv();
  const app = await electron.launch({ args: [process.cwd()], env });
  const page = await app.firstWindow();
  try {
    // 测试失败时也能关闭窗口，避免原生未保存对话框阻塞错误报告。
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 1;
    });
    await page.getByRole('button', { name: '打开示例工程', exact: true }).click();
    const canvas = page.getByLabel('图案编辑画布');
    await expect(canvas).toHaveAttribute('data-ready', 'true');
    await page.getByRole('button', { name: '放大', exact: true }).click();
    await page.getByRole('button', { name: '放大', exact: true }).click();
    await page.keyboard.press('e');
    const erase = page.getByRole('button', { name: '擦除', exact: true });
    const undo = page.getByRole('button', { name: '撤销', exact: true });
    const viewport = page.locator('.canvas-viewport');
    const host = (await viewport.boundingBox())!;
    const x = host.x + host.width / 2;
    const y = host.y + host.height / 2;
    await page.mouse.move(x, y);
    const before = await viewport.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop,
    }));
    const pixels = await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL());
    await page.keyboard.down('Space');
    await expect(page.locator('.raster-frame')).toHaveClass(/tool-hand/);
    await page.mouse.down();
    await page.mouse.move(x - 60, y - 45, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Space');
    await expect(erase).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.raster-frame')).toHaveClass(/tool-erase/);
    const after = await viewport.evaluate((element) => ({
      left: element.scrollLeft,
      top: element.scrollTop,
    }));
    expect(after.left > before.left || after.top > before.top).toBe(true);
    expect(await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())).toBe(
      pixels,
    );
    await expect(undo).toBeDisabled();

    for (const cancel of ['Escape', 'blur']) {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 30, y + 30, { steps: 3 });
      await expect
        .poll(
          async () =>
            (await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())) !==
            pixels,
        )
        .toBe(true);
      if (cancel === 'Escape') await page.keyboard.press('Escape');
      else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.mouse.up();
      await expect
        .poll(
          async () =>
            (await canvas.evaluate((element) => (element as HTMLCanvasElement).toDataURL())) ===
            pixels,
        )
        .toBe(true);
      await expect(undo).toBeDisabled();
    }
    // 输入框中的空格不能临时切换工具或抢走焦点。
    await page.getByLabel('宽度', { exact: true }).focus();
    await page.keyboard.down('Space');
    await expect(page.locator('.raster-frame')).toHaveClass(/tool-erase/);
    await page.keyboard.up('Space');
    await page.screenshot({ path: 'artifacts/workbench/temporary-pan.png' });
  } finally {
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows().forEach((window) => window.destroy());
    });
    await app.close();
  }
});
