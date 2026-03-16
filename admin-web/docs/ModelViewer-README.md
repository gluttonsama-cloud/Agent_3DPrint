# ModelViewer 组件使用文档

## 概述
`ModelViewer` 是一个基于 Three.js 的 3D 模型预览组件，支持 STL 和 OBJ 格式的 3D 模型文件加载和查看。

## 功能特性
- ✅ 支持 STL 格式加载（主要格式）
- ✅ 支持 OBJ 格式加载
- ✅ 360 度旋转查看（OrbitControls）
- ✅ 缩放功能
- ✅ 自动居中模型
- ✅ 自动计算合适大小
- ✅ 自动旋转展示
- ✅ 加载进度显示
- ✅ 错误处理
- ✅ 响应式设计（支持窗口大小变化）
- ✅ 内存泄漏防护（完整的清理机制）

## 安装依赖
项目已预装 Three.js，无需额外安装：
```json
{
  "dependencies": {
    "three": "0.182.0",
    "@types/three": "^0.162.0"
  }
}
```

## 使用方法

### 基本用法
```tsx
import ModelViewer from '@/components/ModelViewer';

function App() {
  return (
    <ModelViewer 
      modelUrl="https://example.com/model.stl"
      width="100%"
      height="400px"
    />
  );
}
```

### 完整示例
```tsx
import ModelViewer from '@/components/ModelViewer';

function ModelPreview() {
  const handleLoad = () => {
    console.log('模型加载完成');
  };

  const handleError = (error: Error) => {
    console.error('模型加载失败:', error);
  };

  const handleProgress = (progress: number) => {
    console.log('加载进度:', progress * 100, '%');
  };

  return (
    <ModelViewer
      modelUrl="/path/to/model.stl"
      width="800px"
      height="600px"
      autoRotate={true}
      showGrid={true}
      backgroundColor="#ffffff"
      onLoad={handleLoad}
      onError={handleError}
      onProgress={handleProgress}
    />
  );
}
```

## 组件属性（Props）

| 属性名 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `modelUrl` | `string` | 必填 | 模型文件的 URL 地址 |
| `width` | `string` | `'100%'` | 容器宽度，支持 CSS 单位 |
| `height` | `string` | `'400px'` | 容器高度，支持 CSS 单位 |
| `autoRotate` | `boolean` | `true` | 是否自动旋转模型 |
| `showGrid` | `boolean` | `false` | 是否显示网格地面和坐标轴 |
| `backgroundColor` | `string` | `'#f5f5f5'` | 背景颜色 |
| `onLoad` | `() => void` | - | 模型加载完成回调 |
| `onError` | `(error: Error) => void` | - | 加载失败回调 |
| `onProgress` | `(progress: number) => void` | - | 加载进度回调（0-1） |

## 支持的文件格式

### STL 格式
- 适用于 3D 打印的标准格式
- 支持二进制和 ASCII 编码
- 文件扩展名：`.stl`

### OBJ 格式
- 通用的 3D 模型格式
- 支持纹理和材质（需要配套的 .mtl 文件）
- 文件扩展名：`.obj`

## 实际案例

### 订单详情页面集成
```tsx
import { Upload, Button, message } from 'antd';
import ModelViewer from '@/components/ModelViewer';

function OrderForm() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  const handleFileChange = async (info: any) => {
    const file = info.file;
    
    // 验证文件类型
    if (!file.name.endsWith('.stl') && !file.name.endsWith('.obj')) {
      message.error('仅支持 STL 和 OBJ 格式');
      return;
    }
    
    // 验证文件大小（最大 50MB）
    if (file.size > 50 * 1024 * 1024) {
      message.error('文件大小不能超过 50MB');
      return;
    }

    // 创建本地预览 URL
    const url = URL.createObjectURL(file.originFileObj);
    setModelUrl(url);
  };

  return (
    <div>
      {!modelUrl ? (
        <Upload
          accept=".stl,.obj"
          beforeUpload={() => false}
          onChange={handleFileChange}
        >
          <Button>上传 3D 模型</Button>
        </Upload>
      ) : (
        <ModelViewer
          modelUrl={modelUrl}
          height="400px"
          showGrid={true}
        />
      )}
    </div>
  );
}
```

## 性能优化建议

1. **文件大小限制**：建议限制上传文件不超过 50MB
2. **模型简化**：对于面数过多的模型，建议预先简化
3. **URL 对象清理**：使用 `URL.createObjectURL` 创建的 URL 应在不需要时调用 `URL.revokeObjectURL` 释放
4. **组件卸载**：组件会自动清理所有 Three.js 资源，无需手动处理

## 注意事项

1. **跨域问题**：如果模型文件来自不同域名，需要服务器配置 CORS 头
2. **移动端支持**：在移动设备上建议禁用自动旋转以节省电量
3. **阴影效果**：当前版本未启用阴影，如需阴影效果可修改光源配置

## 故障排除

### 模型不显示
- 检查 `modelUrl` 是否正确
- 查看浏览器控制台是否有错误信息
- 确认模型文件格式是否受支持

### 加载速度慢
- 检查文件大小，过大的文件会导致加载缓慢
- 考虑使用 Draco 压缩格式（需额外配置）

### 内存泄漏
- 组件已自动处理资源清理
- 如果手动创建 URL 对象，请确保在适当时机调用 `URL.revokeObjectURL`

## 文件结构
```
admin-web/src/components/ModelViewer/
├── ModelViewer.tsx    # 核心组件
└── index.ts           # 导出文件
```

## 后续扩展计划
- [ ] 支持 3MF 格式
- [ ] 支持 GLTF/GLB 格式
- [ ] 测量工具（尺寸标注）
- [ ] 剖面查看
- [ ] 多模型同时显示
- [ ] 自定义材质和颜色
