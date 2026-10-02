"""v2 文件边界：显式迁移、另存保护和同目录原子替换。"""
import json
import os
import tempfile
from pathlib import Path
from uuid import uuid4

from project_v2 import (MAX_FILE_BYTES, _invalid_constant, _unique_object, decode_project,
                        dumps_project, encode_project, migrate_v1)


def read_json(path):
  with Path(path).open('rb') as stream:
    data = stream.read(MAX_FILE_BYTES + 1)
  if len(data) > MAX_FILE_BYTES:
    raise ValueError('工程超过 128 MiB 上限')
  try:
    result = json.loads(data.decode('utf-8-sig'), object_pairs_hook=_unique_object,
                        parse_constant=_invalid_constant)
  except (UnicodeError, RecursionError) as error:
    raise ValueError('工程 JSON/UTF-8 损坏') from error
  if not isinstance(result, dict):
    raise ValueError('工程必须为对象')
  return result


def open_project(path):
  value = read_json(path)
  migrated = type(value.get('version')) is int and value['version'] == 1
  snapshot = migrate_v1(value) if migrated else decode_project(value)
  snapshot['sessionId'] = str(uuid4())
  snapshot['revision'] = 0
  return {'snapshot': encode_project(snapshot), 'migrated': migrated, 'sourcePath': str(path)}


def save_project(snapshot, destination):
  path = Path(destination).resolve()
  # 即使调用者忘记传入迁移标记，也不能覆盖任何已有 v1 文件。
  if path.exists() and read_json(path).get('version') == 1:
    raise ValueError('旧版工程首次保存 v2 必须另存，不能覆盖 v1 原件')
  data = dumps_project(snapshot).encode('utf-8')
  path.parent.mkdir(parents=True, exist_ok=True)
  descriptor, temporary = tempfile.mkstemp(prefix=f'.{path.name}-', suffix='.tmp', dir=path.parent)
  try:
    with os.fdopen(descriptor, 'wb') as stream:
      stream.write(data)
      stream.flush()
      os.fsync(stream.fileno())
    os.replace(temporary, path)
  finally:
    Path(temporary).unlink(missing_ok=True)
  return {'path': str(path)}
