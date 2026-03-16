const express = require('express');
const axios = require('axios');
const taskStore = require('../services/taskStore');

const router = express.Router();

/**
 * GET /api/download/:taskId
 * 获取模型下载 URL
 */
router.get('/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { format = 'glb' } = req.query;

    console.log(`📥 下载请求：${taskId} (${format})`);

    // 1. 获取任务
    const task = taskStore.getTask(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'TASK_NOT_FOUND',
        message: '任务不存在'
      });
    }

    // 2. 检查任务状态
    if (task.status !== 'SUCCEEDED') {
      return res.status(400).json({
        success: false,
        error: 'TASK_NOT_COMPLETED',
        message: `任务未完成，当前状态：${task.status}`,
        status: task.status,
        progress: task.progress
      });
    }

    // 3. 检查是否有结果
    if (!task.result || !task.result.modelUrls) {
      return res.status(500).json({
        success: false,
        error: 'MODEL_NOT_FOUND',
        message: '模型文件不存在'
      });
    }

    // 4. 返回下载 URL
    const downloadUrls = {
      glb: task.result.modelUrls.glb,
      obj: task.result.modelUrls.obj
    };

    // 如果指定了格式，返回单个 URL
    if (format) {
      const url = downloadUrls[format];
      
      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_FORMAT',
          message: `不支持的格式：${format}，支持：glb, obj`
        });
      }

      return res.json({
        success: true,
        taskId,
        downloadUrl: url,
        format,
        previewUrl: task.result.previewUrl,
        expiresIn: 7200
      });
    }

    // 返回所有格式
    res.json({
      success: true,
      taskId,
      downloadUrls,
      previewUrl: task.result.previewUrl,
      expiresIn: 7200
    });

  } catch (error) {
    console.error('下载 API 错误:', error);
    res.status(500).json({
      success: false,
      error: 'DOWNLOAD_ERROR',
      message: error.message || '下载失败'
    });
  }
});

/**
 * GET /api/model/:taskId
 * 直接下载模型文件（代理下载）
 */
router.get('/model/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { format = 'glb' } = req.query;

    console.log(`📥 代理下载请求：${taskId} (${format})`);

    // 1. 获取任务
    const task = taskStore.getTask(taskId);

    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'TASK_NOT_FOUND',
        message: '任务不存在'
      });
    }

    // 2. 检查任务状态
    if (task.status !== 'SUCCEEDED') {
      return res.status(400).json({
        success: false,
        error: 'TASK_NOT_COMPLETED',
        message: `任务未完成，当前状态：${task.status}`
      });
    }

    // 3. 获取模型 URL
    if (!task.result || !task.result.modelUrls) {
      return res.status(500).json({
        success: false,
        error: 'MODEL_NOT_FOUND',
        message: '模型文件不存在'
      });
    }

    const modelUrl = task.result.modelUrls[format];

    if (!modelUrl) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_FORMAT',
        message: `不支持的格式：${format}`
      });
    }

    // 4. 代理下载（流式传输）
    console.log(`⬇️  开始从源 URL 下载：${modelUrl}`);

    const response = await axios.get(modelUrl, {
      responseType: 'stream',
      timeout: 30000
    });

    // 设置响应头
    const filename = `3d-model-${taskId}.${format === 'glb' ? 'glb' : 'zip'}`;
    
    res.setHeader('Content-Type', format === 'glb' ? 'model/gltf-binary' : 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    // 流式传输
    response.data.pipe(res);

    console.log(`✅ 代理下载完成：${filename}`);

  } catch (error) {
    console.error('代理下载失败:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'DOWNLOAD_FAILED',
        message: error.message || '下载失败'
      });
    }
  }
});

module.exports = router;
