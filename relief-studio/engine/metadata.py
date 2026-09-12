"""恢复旧版 UTF-8 管道被 GBK 误读的名称，不改几何数据。"""


def restore_text(text):
  # 只处理已知默认名称；编码可以往返不代表自定义名称就是乱码。
  for original in ('平面背景', '浮雕主体', '微信图片'):
    for codec in ('gbk', 'gb18030'):
      broken = original.encode('utf-8').decode(codec, errors='replace')
      text = text.replace(broken, original)
  return text


def restore_metadata(project):
  return {**project, 'name':restore_text(project['name']),
    'regions':[{**r,'name':restore_text(r['name'])} for r in project['regions']]}
