import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { decodeProject } from '../src/project-codec';

async function launchWorkbench(mock = false) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const args = mock ? ['--d1'] : [];
  const packaged = env.RELIEF_TEST_PACKAGED === '1';
  if (packaged) {
    env.PATH = `${process.env.SystemRoot}\\System32`;
    delete env.PYTHONHOME; delete env.PYTHONPATH;
  }
  const app = await electron.launch(packaged ? {
    executablePath: env.RELIEF_TEST_EXECUTABLE || path.join(process.cwd(), 'release/win-unpacked/Relief Studio.exe'), args, env,
  } : { args: [process.cwd(), ...args], env });
  expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(packaged);
  return app;
}

test('真实工作台高度接口：保存重开保留逐像素高度及保护，PNG 输出同源', async () => {
  const app = await launchWorkbench();
  const page = await app.firstWindow();
  const directory = path.join(process.cwd(), 'artifacts', `d1-real-${Date.now()}`);
  await fs.mkdir(directory, { recursive: true });
  try {
    await page.getByRole('button', { name: '打开示例工程', exact: true }).click();
    await page.getByText('像素高度', { exact: true }).click();
    await page.getByLabel('白墨层数', { exact: true }).fill('7');
    await page.getByRole('button', { name: '应用选区高度', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('高度已应用');
    const filename = path.join(directory, 'edited-v2.json');
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, filename);
    await page.getByRole('button', { name: '保存工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已保存');
    const saved = decodeProject(JSON.parse(await fs.readFile(filename, 'utf8')));
    expect(saved.labels.every((id, i) => saved.heights[i] === (id ? 7 : 0))).toBe(true);
    expect(saved.labels.every((id, i) => !id || !!(saved.protection[i] & 4))).toBe(true);
    await page.getByRole('button', { name: '打开工程', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('工程已恢复');
    await page.getByRole('button', { name: '3D 浮雕', exact: true }).click();
    await expect(page.locator('.preview-host canvas')).toBeVisible();
    await page.getByRole('button', { name: '导出分层', exact: true }).click();
    const output = path.join(directory, 'bundle');
    await page.getByLabel('新输出目录').fill(output);
    await page.getByRole('button', { name: '导出', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('分层文件已导出');
    expect(await fs.readdir(path.join(output, 'white'))).toHaveLength(7);
    const exported = decodeProject(JSON.parse(await fs.readFile(path.join(output, 'project.json'), 'utf8')));
    expect(exported.heights).toEqual(saved.heights); expect(exported.protection).toEqual(saved.protection);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});

test('D1 实际工作台：候选、历史、预览、取消和过期返回', async () => {
  const app = await launchWorkbench(true);
  const page = await app.firstWindow();
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    await page.getByRole('button', { name: '打开示例工程', exact: true }).click();
    const state = page.getByLabel('D1 状态');
    await expect(state).toHaveAttribute('data-revision', '0');
    const original = await state.getAttribute('data-heights');
    await page.getByText('像素高度', { exact: true }).click();
    const apply = page.getByRole('button', { name: '应用选区高度', exact: true });
    await page.getByLabel('白墨层数', { exact: true }).fill('7'); await apply.click();
    await expect(state).toHaveAttribute('data-history', '1');
    await expect(state).not.toHaveAttribute('data-heights', original!);
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(state).toHaveAttribute('data-heights', original!);
    await expect(state).toHaveAttribute('data-revision', '2');
    await page.getByRole('button', { name: '重做', exact: true }).click();
    await expect(state).toHaveAttribute('data-revision', '3');
    await page.getByLabel('临时高度预览').fill('9');
    await expect(state).toHaveAttribute('data-preview', 'true');
    await expect(state).toHaveAttribute('data-history', '1');
    await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(state).toHaveAttribute('data-preview', 'false');
    await page.getByLabel('模拟场景').selectOption('delayed');
    await apply.click();
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('已丢弃过期结果');
    await expect(state).toHaveAttribute('data-heights', original!);
    await apply.click(); await page.getByRole('button', { name: '取消', exact: true }).click();
    await expect(page.locator('.statusbar')).toContainText('已取消');
    await expect(state).toHaveAttribute('data-history', '0');
    await page.getByLabel('模拟场景').selectOption('failure'); await apply.click();
    await expect(page.locator('.statusbar')).toContainText('模拟算法失败');
    await expect(state).toHaveAttribute('data-history', '0');
    await page.getByLabel('模拟场景').selectOption('stale'); await apply.click();
    await expect(page.locator('.statusbar')).toContainText('已丢弃过期结果');
    await expect(state).toHaveAttribute('data-heights', original!);
    await page.screenshot({ path: 'artifacts/d1/workbench.png', fullPage: true });
    expect(errors).toEqual([]);
  } finally {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy()));
    await app.close();
  }
});
