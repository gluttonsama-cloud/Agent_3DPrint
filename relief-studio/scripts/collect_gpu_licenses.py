"""随独立模型包收集已安装依赖的授权声明。"""
import importlib.metadata
import json
import shutil
from pathlib import Path

root=Path(__file__).resolve().parents[1]
output=root/'release/0.3.0/win-unpacked/model-runtime/licenses'
output.mkdir(parents=True,exist_ok=True)
inventory=[]
for distribution in importlib.metadata.distributions():
  name=distribution.metadata.get('Name','unknown')
  files=[]
  for file in distribution.files or []:
    if any(word in str(file).lower() for word in ('license','copying','notice')):
      source=Path(distribution.locate_file(file))
      if source.is_file():
        destination=output/name/Path(str(file)).name
        destination.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(source,destination)
        files.append(str(destination.relative_to(output)))
  inventory.append({'name':name,'version':distribution.version,'files':files})
shutil.copyfile(root/'artifacts/sam2-source/LICENSE',output/'SAM2-LICENSE')
(output/'inventory.json').write_text(json.dumps(inventory,indent=2),'utf-8')
