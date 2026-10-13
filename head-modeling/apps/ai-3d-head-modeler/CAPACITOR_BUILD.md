# Capacitor Android 打包指南

本项目已配置 Capacitor，可以将 React Web 应用打包为 Android APK。

## 快速开始

### 1. 开发构建流程

```bash
# 安装依赖
npm install

# 构建 Web 项目
npm run build

# 同步到 Android
npx cap sync android
```

### 2. 打开 Android Studio

```bash
npx cap open android
```

这会打开 Android Studio，你可以在其中：
- 运行模拟器测试
- 构建 APK/AAB
- 签名发布版本

### 3. 构建 APK

在 Android Studio 中：

**调试版 APK：**
1. 菜单 → Build → Build Bundle(s) / APK(s) → Build APK(s)
2. APK 位于：`android/app/build/outputs/apk/debug/app-debug.apk`

**发布版 APK：**
1. 菜单 → Build → Generate Signed Bundle / APK
2. 选择 APK → 创建或使用现有签名
3. 选择 release 构建变体
4. APK 位于：`android/app/build/outputs/apk/release/app-release.apk`

---

## 命令行打包（无需 Android Studio）

### 调试版 APK

```bash
cd android
./gradlew assembleDebug
```

APK 输出：`android/app/build/outputs/apk/debug/app-debug.apk`

### 发布版 APK

```bash
cd android
./gradlew assembleRelease
```

APK 输出：`android/app/build/outputs/apk/release/app-release.apk`

> 注意：发布版需要先配置签名

---

## 配置说明

### 应用信息 (capacitor.config.ts)

```typescript
{
  appId: 'com.ai3dhead.modeler',    // 应用包名
  appName: 'AI 3D 头像建模',         // 应用名称
  webDir: 'dist',                    // 构建输出目录
}
```

### 修改应用图标

将图标文件放入以下目录：

```
android/app/src/main/res/
├── mipmap-mdpi/ic_launcher.png      (48x48)
├── mipmap-hdpi/ic_launcher.png      (72x72)
├── mipmap-xhdpi/ic_launcher.png     (96x96)
├── mipmap-xxhdpi/ic_launcher.png    (144x144)
└── mipmap-xxxhdpi/ic_launcher.png   (192x192)
```

### 修改应用名称

编辑 `android/app/src/main/res/values/strings.xml`：

```xml
<string name="app_name">AI 3D 头像建模</string>
<string name="title_activity_main">AI 3D 头像建模</string>
```

### 修改包名

1. 编辑 `capacitor.config.ts` 中的 `appId`
2. 运行 `npx cap sync android`
3. 在 Android Studio 中 Refactor → Rename Package

---

## 常见问题

### Q: API 请求失败？

App 内访问 `localhost` 会失败。需要修改 `.env.local`：

```bash
# 改为实际服务器地址
VITE_API_BASE_URL=http://你的服务器IP:3001/api

# 或使用局域网 IP 测试
VITE_API_BASE_URL=http://192.168.x.x:3001/api
```

然后重新构建：

```bash
npm run build
npx cap sync android
```

### Q: 相机/相册权限？

编辑 `android/app/src/main/AndroidManifest.xml`，添加：

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" />
```

### Q: 白屏问题？

1. 检查构建是否成功
2. 检查 `dist` 目录是否有内容
3. 运行 `npx cap sync android` 重新同步

### Q: 如何调试？

```bash
# 方法1: Chrome 远程调试
# 手机连接电脑，打开 chrome://inspect

# 方法2: Android Studio Logcat
# 查看 WebView 相关日志
```

---

## iOS 打包（需要 Mac）

```bash
# 安装 iOS 依赖
npm install @capacitor/ios

# 添加 iOS 平台
npx cap add ios

# 同步
npx cap sync ios

# 打开 Xcode
npx cap open ios
```

---

## 项目结构

```
ai-3d-head-modeler/
├── android/                 # Android 原生项目
│   ├── app/
│   │   ├── src/main/
│   │   │   ├── assets/public/   # Web 资源
│   │   │   ├── res/             # 原生资源（图标等）
│   │   │   └── AndroidManifest.xml
│   │   └── build.gradle
│   └── ...
├── src/                     # React 源码
├── dist/                    # Web 构建输出
├── capacitor.config.ts      # Capacitor 配置
└── package.json
```

---

## 相关链接

- [Capacitor 官方文档](https://capacitorjs.com/docs)
- [Android Studio 下载](https://developer.android.com/studio)
- [Capacitor Android 配置](https://capacitorjs.com/docs/android/configuration)