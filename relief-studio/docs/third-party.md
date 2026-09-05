# 第三方依赖记录

本文件用于内部演示交付的依赖追踪。实际 npm 版本以 `package-lock.json` 为准，Python 版本以
`engine/requirements.txt` 为准。所有第三方版权仍归原作者。

| 组件 | 用途 | 主要许可 |
| --- | --- | --- |
| Electron | 桌面运行时 | MIT，包含 Chromium 及其第三方声明 |
| React / React DOM / scheduler | 界面 | MIT |
| Three.js | 三维显示 | MIT |
| Python | 算法运行时 | Python Software Foundation License |
| NumPy | 数组运算 | BSD-3-Clause，包含其二进制依赖声明 |
| OpenCV | 图像聚类 | Apache-2.0，发行包包含其他许可声明 |
| Pillow | PNG/JPEG 读写 | HPND 及发行包声明 |
| PyInstaller | 构建打包 | GPL-2.0-or-later with exception，见其发行条款 |

Electron 打包目录包含 `LICENSE.electron.txt`、`LICENSES.chromium.html`。
另通过 `scripts/collect_licenses.cjs` 收集应用生产依赖与 Python 运行时/包声明到
`licenses/`，随安装包 `resources/licenses/` 分发。

SAM 2.1 仅用于独立实验，不打入客户程序。官方权重和主体代码 Apache-2.0；所用官方仓库
commit 与权重 SHA256 记录在实验 JSON。实验环境单独安装 PyTorch CPU、torchvision、
hydra-core、iopath、tqdm 与 psutil，冻结版本见 `docs/sam2-environment.txt`。

没有在本阶段购买或嵌入任何商业 RIP、厂商 SDK 或模型 API。
