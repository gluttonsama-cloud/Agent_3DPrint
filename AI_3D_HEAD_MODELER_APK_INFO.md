# AI 3D 头像建模 - Android APK 打包完成

## 📦 APK 文件信息

| 属性 | 值 |
|------|------|
| **文件名** | `app-release.apk` |
| **完整路径** | `ai-3d-head-modeler/android/app/build/outputs/apk/release/app-release.apk` |
| **文件大小** | 30 MB |
| **应用名称** | AI 3D 头像建模 |
| **包名** | `com.ai3dhead.modeler` |
| **版本号** | 1.0 (versionCode: 1) |
| **签名状态** | ✅ 已签名（Debug 签名） |
| **API 地址** | `http://111.62.241.109/api` |

---

## ✅ 已配置权限

```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-feature android:name="android.hardware.camera" />
<uses-feature android:name="android.hardware.camera.autofocus" />
```

---

## 🚀 功能特性

### 核心功能
- ✅ **单图/多图模式**：支持 1-4 张照片上传
- ✅ **多视角 3D 建模**：自动映射视角（主视/右侧/后视/左侧）
- ✅ **腾讯混元 API**：Model 3.0，支持 MultiViewImages
- ✅ **背景抠图**：可选开关（需配置 API Key）
- ✅ **实时进度**：WebSocket 轮询更新
- ✅ **3D 预览**：内置 Three.js 渲染器

### 视角映射
| 前端槽位 | 视角名称 | API 参数 |
|----------|----------|----------|
| 0: 主视角 | ImageBase64（主图） | `ImageBase64` |
| 1: 侧面照 | 右侧视图 | `MultiViewImages[0].ViewType = "right"` |
| 2: 仰视照 | 后视图 | `MultiViewImages[1].ViewType = "back"` |
| 3: 其他角度 | 左侧视图 | `MultiViewImages[2].ViewType = "left"` |

---

## 📥 安装方式

### 方式 1：直接安装（USB 调试）
```bash
adb install ai-3d-head-modeler/android/app/build/outputs/apk/release/app-release.apk
```

### 方式 2：手动传输
1. 将 APK 文件传输到手机
2. 在手机上打开 APK 文件
3. 允许"未知来源"安装
4. 完成安装

---

## 🧪 测试流程

1. **启动 APP**
   - 打开 "AI 3D 头像建模"
   - 查看引导页

2. **拍照上传**
   - 点击"开始拍摄"
   - 上传 1-4 张不同角度照片
   - 建议：主视 + 右侧 + 后视

3. **等待生成**
   - 实时进度显示（约 3-5 分钟）
   - 50% 表示混元 API 处理中

4. **3D 预览**
   - 360° 旋转模型
   - 缩放查看细节
   - 下单打印（后续功能）

---

## 🔧 后续优化

### 发布签名（生产环境）
```bash
keytool -genkey -v -keystore release.keystore -alias ai3d -keyalg RSA -keysize 2048 -validity 10000
```

修改 `build.gradle`：
```gradle
signingConfigs {
    release {
        storeFile file('release.keystore')
        storePassword 'your_password'
        keyAlias 'ai3d'
        keyPassword 'your_password'
    }
}
```

### 功能扩展
- [ ] 添加发布版签名配置
- [ ] 优化首屏加载速度（代码分割）
- [ ] 添加错误日志上报
- [ ] 支持更多视角（top/bottom，需 Model 3.1）
- [ ] 离线缓存策略

---

## 📱 截图位置

| 页面 | 文件路径 |
|------|----------|
| 引导页 | `screenshot-guide-page.png` |
| 上传页 | `screenshot-upload-page.png` |
| 处理中 | `screenshot-processing-page.png` |
| 预览页 | `screenshot-preview-page.png` |
| 订单页 | `screenshot-order-page.png` |

---

## 🛠️ 构建命令

```bash
# 开发调试版
cd ai-3d-head-modeler
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug

# 生产发布版
cd ai-3d-head-modeler
npm run build
npx cap sync android
cd android && ./gradlew assembleRelease
```

---

## 📞 服务器信息

| 组件 | 状态 | 地址 |
|------|------|------|
| 后端 API | ✅ 运行中 | http://111.62.241.109/api |
| 前端静态 | ✅ 已部署 | http://111.62.241.109/ |
| PM2 | ✅ 管理 | 3d-api 进程 |
| Nginx | ✅ 反向代理 | 端口 80 |

---

**打包时间**: 2026-03-18  
**打包版本**: v1.0  
**构建机器**: Windows  
**Capacitor 版本**: 8.x
