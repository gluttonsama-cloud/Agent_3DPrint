/**
 * 设备查询工具
 * 
 * 为 Agent 提供设备相关的查询和操作能力
 * 包含设备查询、状态更新、调度分配等功能
 */

const Device = require('../../models/Device');
const { agentEventEmitter } = require('../../utils/AgentEventEmitter');

/**
 * 设备工具集合
 */
const deviceTools = {
  /**
   * 根据 ID 查询设备
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.deviceId - 设备 ID
   * @returns {Promise<Object|null>} 设备信息
   */
  getDeviceById: {
    name: 'getDeviceById',
    description: '根据设备 ID 查询设备详细信息',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: '设备 ID'
        }
      },
      required: ['deviceId']
    },
    execute: async (input) => {
      try {
        console.log('[DeviceTool] 查询设备:', input.deviceId);
        
        const device = await Device.findOne({ deviceId: input.deviceId });
        
        if (!device) {
          return {
            success: false,
            error: '设备不存在',
            deviceId: input.deviceId
          };
        }
        
        return {
          success: true,
          device: {
            id: device._id,
            deviceId: device.deviceId,
            type: device.type,
            status: device.status,
            currentTask: device.currentTask,
            capacity: device.capacity,
            specifications: device.specifications,
            location: device.location,
            createdAt: device.createdAt,
            updatedAt: device.updatedAt
          }
        };
      } catch (error) {
        console.error('[DeviceTool] 查询设备失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 查询所有设备
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.type - 设备类型过滤
   * @param {string} input.status - 设备状态过滤
   * @returns {Promise<Array>} 设备列表
   */
  getAllDevices: {
    name: 'getAllDevices',
    description: '查询所有设备，可按类型和状态过滤',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: '设备类型：sla, fdm, sls, mjf',
          enum: ['sla', 'fdm', 'sls', 'mjf']
        },
        status: {
          type: 'string',
          description: '设备状态：idle, busy, maintenance, offline',
          enum: ['idle', 'busy', 'maintenance', 'offline']
        }
      }
    },
    execute: async (input) => {
      try {
        console.log('[DeviceTool] 查询所有设备，类型:', input.type, '状态:', input.status);
        
        const query = {};
        if (input.type) query.type = input.type;
        if (input.status) query.status = input.status;
        
        const devices = await Device.find(query);
        
        return {
          success: true,
          devices: devices.map(device => ({
            id: device._id,
            deviceId: device.deviceId,
            type: device.type,
            status: device.status,
            currentLoad: device.capacity.currentLoad,
            location: device.location
          })),
          count: devices.length
        };
      } catch (error) {
        console.error('[DeviceTool] 查询设备列表失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 查询可用设备
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.type - 设备类型
   * @returns {Promise<Array>} 可用设备列表
   */
  getAvailableDevices: {
    name: 'getAvailableDevices',
    description: '查询可用的空闲设备',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          description: '设备类型：sla, fdm, sls, mjf',
          enum: ['sla', 'fdm', 'sls', 'mjf']
        }
      }
    },
    execute: async (input) => {
      try {
        console.log('[DeviceTool] 查询可用设备，类型:', input.type);
        
        const devices = await Device.findAvailable(input.type);
        
        return {
          success: true,
          devices: devices.map(device => ({
            id: device._id,
            deviceId: device.deviceId,
            type: device.type,
            status: device.status,
            currentLoad: device.capacity.currentLoad,
            location: device.location
          })),
          count: devices.length
        };
      } catch (error) {
        console.error('[DeviceTool] 查询可用设备失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 分配任务到设备
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.deviceId - 设备 ID
   * @param {string} input.orderId - 订单 ID
   * @param {string} input.estimatedCompletion - 预计完成时间
   * @returns {Promise<Object>} 分配结果
   */
  assignTaskToDevice: {
    name: 'assignTaskToDevice',
    description: '将任务分配给指定设备',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: '设备 ID'
        },
        orderId: {
          type: 'string',
          description: '订单 ID'
        },
        estimatedCompletion: {
          type: 'string',
          description: '预计完成时间 (ISO 格式)'
        }
      },
      required: ['deviceId', 'orderId']
    },
    execute: async (input) => {
      try {
        console.log('[DeviceTool] 分配任务到设备:', input.deviceId, '订单:', input.orderId);
        
        const device = await Device.findOne({ deviceId: input.deviceId });
        
        if (!device) {
          return {
            success: false,
            error: '设备不存在'
          };
        }
        
        if (device.status !== 'idle') {
          return {
            success: false,
            error: '设备当前不可用',
            currentStatus: device.status
          };
        }
        
        const previousStatus = device.status;
        await device.assignTask(
          input.orderId,
          input.estimatedCompletion ? new Date(input.estimatedCompletion) : null
        );
        
        // 发射调度完成事件
        agentEventEmitter.emitSchedulingCompleted({
          orderId: input.orderId,
          deviceId: device._id,
          scheduledTime: new Date()
        });
        
        return {
          success: true,
          device: {
            id: device._id,
            deviceId: device.deviceId,
            previousStatus,
            currentStatus: device.status,
            currentTask: device.currentTask
          }
        };
      } catch (error) {
        console.error('[DeviceTool] 分配任务失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 释放设备任务
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.deviceId - 设备 ID
   * @returns {Promise<Object>} 释放结果
   */
  releaseDeviceTask: {
    name: 'releaseDeviceTask',
    description: '完成设备当前任务并释放设备',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: '设备 ID'
        }
      },
      required: ['deviceId']
    },
    execute: async (input) => {
      try {
        console.log('[DeviceTool] 释放设备任务:', input.deviceId);
        
        const device = await Device.findOne({ deviceId: input.deviceId });
        
        if (!device) {
          return {
            success: false,
            error: '设备不存在'
          };
        }
        
        const previousTask = device.currentTask;
        await device.completeTask();
        
        return {
          success: true,
          device: {
            id: device._id,
            deviceId: device.deviceId,
            previousTask,
            currentStatus: device.status
          }
        };
      } catch (error) {
        console.error('[DeviceTool] 释放设备失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  },

  /**
   * 更新设备状态
   * 
   * @param {Object} input - 输入参数
   * @param {string} input.deviceId - 设备 ID
   * @param {string} input.status - 新状态
   * @returns {Promise<Object>} 更新结果
   */
  updateDeviceStatus: {
    name: 'updateDeviceStatus',
    description: '更新设备状态',
    inputSchema: {
      type: 'object',
      properties: {
        deviceId: {
          type: 'string',
          description: '设备 ID'
        },
        status: {
          type: 'string',
          description: '新状态',
          enum: ['idle', 'busy', 'maintenance', 'offline']
        }
      },
      required: ['deviceId', 'status']
    },
    execute: async (input) => {
      try {
        console.log('[DeviceTool] 更新设备状态:', input.deviceId, '->', input.status);
        
        const device = await Device.findOne({ deviceId: input.deviceId });
        
        if (!device) {
          return {
            success: false,
            error: '设备不存在'
          };
        }
        
        const previousStatus = device.status;
        device.status = input.status;
        await device.save();
        
        return {
          success: true,
          device: {
            id: device._id,
            deviceId: device.deviceId,
            previousStatus,
            currentStatus: device.status
          }
        };
      } catch (error) {
        console.error('[DeviceTool] 更新设备状态失败:', error.message);
        return {
          success: false,
          error: error.message
        };
      }
    }
  }
};

module.exports = deviceTools;
