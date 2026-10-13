/**
 * 工具导出模块
 * 
 * 统一导出所有 Agent 工具
 * 方便 Agent 注册中心和其他模块使用
 */

const orderTools = require('./orderTools');
const deviceTools = require('./deviceTools');
const materialTools = require('./materialTools');

/**
 * 所有工具集合
 */
const allTools = {
  ...orderTools,
  ...deviceTools,
  ...materialTools
};

/**
 * 按类别组织的工具
 */
const toolsByCategory = {
  order: orderTools,
  device: deviceTools,
  material: materialTools
};

/**
 * 获取工具列表
 * 
 * @returns {Array} 工具名称列表
 */
function getToolNames() {
  return Object.keys(allTools);
}

/**
 * 获取工具详情
 * 
 * @param {string} toolName - 工具名称
 * @returns {Object|null} 工具详情
 */
function getToolDetails(toolName) {
  const tool = allTools[toolName];
  if (!tool) {
    return null;
  }
  
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema
  };
}

/**
 * 获取所有工具详情
 * 
 * @returns {Object} 所有工具详情
 */
function getAllToolDetails() {
  const details = {};
  
  for (const [name, tool] of Object.entries(allTools)) {
    details[name] = {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    };
  }
  
  return details;
}

module.exports = {
  // 单个工具模块
  orderTools,
  deviceTools,
  materialTools,
  
  // 所有工具集合
  allTools,
  toolsByCategory,
  
  // 工具查询函数
  getToolNames,
  getToolDetails,
  getAllToolDetails
};
