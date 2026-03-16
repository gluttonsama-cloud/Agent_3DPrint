#!/usr/bin/env python
import requests
import io

# 测试健康检查
print("测试 1: 健康检查...")
try:
    response = requests.get("http://localhost:7000/health")
    print(f"✓ 健康检查成功：{response.status_code}")
except Exception as e:
    print(f"✗ 健康检查失败：{e}")
    exit(1)

# 测试抠图
print("\n测试 2: 下载测试图片...")
try:
    img_url = "https://i.postimg.cc/7h23dRgV/zheng-mian.png"
    img_response = requests.get(img_url)
    print(f"✓ 图片已下载：{len(img_response.content)} bytes")
except Exception as e:
    print(f"✗ 下载失败：{e}")
    exit(1)

print("\n测试 3: 发送到 API 抠图...")
try:
    files = {"image": ("test.png", io.BytesIO(img_response.content), "image/png")}
    response = requests.post("http://localhost:7000/api/remove", files=files)

    if response.status_code == 200:
        print(f"✓ 抠图成功！")
        print(f"📦 响应大小：{len(response.content)} bytes")

        # 保存结果
        with open("output.png", "wb") as f:
            f.write(response.content)
        print(f"✅ 结果已保存：output.png")
    else:
        print(f"✗ 抠图失败：{response.status_code}")
        print(response.text)
except Exception as e:
    print(f"✗ 请求失败：{e}")

print("\n完成！")
