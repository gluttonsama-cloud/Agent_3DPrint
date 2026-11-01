// Mac 试用独立配置，避免改变现有 Windows 安装包参数。
module.exports = {
  extends: null,
  appId: 'com.reliefstudio.demo',
  productName: 'Relief Studio',
  directories: { output: 'release/mac-trial' },
  files: ['dist/**/*', 'electron/**/*', 'package.json'],
  extraResources: [
    { from: 'engine-dist/relief-engine', to: 'engine' },
    { from: 'samples', to: 'samples' },
    { from: 'licenses', to: 'licenses' },
  ],
  artifactName: 'Relief-Studio-${version}-mac-trial-${arch}.${ext}',
  mac: {
    target: [{ target: 'dmg', arch: ['arm64'] }],
    category: 'public.app-category.graphics-design',
    minimumSystemVersion: '14.0',
    // 仅为开发试用做 ad-hoc 签名，不冒充 Developer ID 或公证分发。
    identity: '-',
    hardenedRuntime: false,
    notarize: false,
  },
  dmg: { sign: false },
};
