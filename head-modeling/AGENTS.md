# 头部建模工作指引

## 当前范围

保留拍摄上传、图像预处理、3D 生成、模型预览下载及必要基础设施。
报价订单支付、订单履约、设备打印、材料库存、AI 决策调度、运营可视化暂时封存。
未经用户要求，不把封存能力接回正式入口。

## 目录与入口

用户端 apps/ai-3d-head-modeler，后端 services/backend，GPU 服务 services/local-gpu-service。
后端唯一正式入口 src/app.js。跨服务脚本在 scripts，产品部署配置在 deploy。
archive 只保留历史与停用实现；不加入正式构建上下文。

## 工作方式

2 空格缩进，中文注释、英文命名，优先 async/await 与明确的错误处理。
逐模块优化，先确认输入输出、用户问题和验收场景，再修改。
保留当前独立 package.json 与锁文件，不擅自合并 relief-studio 依赖。
功能说明与开发方式见 docs/项目说明.md，进度只更新 docs/重构进度.md。
无付费验证：后端 npm test，用户端 npm run build 与 npm run lint。
真实建模、抠图和 GPU 质量验证单独记录，模拟结果不能作为真实验收。
