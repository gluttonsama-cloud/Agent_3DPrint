# [**Relief Studio**](https://github.com/gluttonsama-cloud/Agent_3DPrint/releases/tag/relief-studio-v0.4.2-d2.4)

Windows 浮雕制版工作台，用于 LOGO、文字和图案的主体识别、分色、轮廓修整及逐像素高度编辑。

## 下载与安装

当前版本：**0.4.2-d2.4 候选版**，支持 Windows 10/11 x64。

从 [Release](https://github.com/gluttonsama-cloud/Agent_3DPrint/releases/tag/relief-studio-v0.4.2-d2.4) 下载 `Relief-Studio-Complete-Setup-0.4.2-d2.4.exe`，约 **148 MB**。

- 手工编辑：安装时选择不启用 AI，无需下载模型。
- AI 识别：选择启用 AI，程序检查 NVIDIA 显卡驱动，自动下载约 **2.61 GB** 的独立模型和 GPU 运行时，校验并安装；无需另装 Python 或 CUDA Toolkit。
- 离线安装：将安装程序和两段 `.7z.001`、`.7z.002` 放在同一文件夹，再运行安装程序。

安装程序未签名，请核对发布来源及 `SHA256SUMS.txt`。详细步骤、空间要求和驱动说明见 [完整安装指引](relief-studio/docs/GPU完整安装指引.md)。

## 功能

- 主体提取、自动分色、局部补选与排除。
- 智能点选、框选、圈选和画笔修整，支持撤销与重做。
- 独立编辑图案颜色、区域层数及逐像素高度，预览 3D 和逐层结果。
- 保存与恢复工程，导出彩图、16 位高度图、白墨分层、PNG/JPG、OBJ 和 STL。

图像处理在本机运行。当前版本不直接控制打印机；客户 RIP、实际层厚与打印效果仍需设备验证。

## 源码与开发

源码位于 [relief-studio](relief-studio/)。开发环境、构建命令与验证记录见 [开发说明](relief-studio/README.md)。
