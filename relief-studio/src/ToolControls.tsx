import { useEffect, useState } from 'react';
import type { Tool } from './EditorCanvas';

const groups = [
  { id: 'point', name: '点选', icon: '✦', label: '点选方式', options: [
    { tool: 'smart', name: '智能点选' }, { tool: 'connected', name: '连通选区' },
  ] },
  { id: 'selection', name: '选区', icon: '□', label: '选区形状', options: [
    { tool: 'rectangle', name: '矩形' }, { tool: 'lasso', name: '自由圈选' },
  ] },
  { id: 'repair', name: '修补', icon: '╱', label: '修补方式', options: [
    { tool: 'brush', name: '补画' }, { tool: 'erase', name: '擦除' },
  ] },
] as const;
type GroupId = typeof groups[number]['id'];
type ToolControlProps = {
  tool: Tool;
  disabled: boolean;
  onSelect: (tool: Tool) => void;
};

export function ToolControls({ tool, disabled, onSelect }: ToolControlProps) {
  const [lastTools, setLastTools] = useState<Record<GroupId, Tool>>({
    point: 'smart', selection: 'rectangle', repair: 'brush',
  });
  const group = groups.find(item => item.options.some(option => option.tool === tool));
  useEffect(() => {
    if (!group) return;
    setLastTools(previous => previous[group.id] === tool ? previous : { ...previous, [group.id]: tool });
  }, [group, tool]);
  return <>
    <div className="edit-tools">
      {groups.map(item => <button key={item.id} aria-label={item.name}
        aria-pressed={group?.id === item.id} className={group?.id === item.id ? 'active' : ''}
        disabled={disabled} onClick={() => onSelect(lastTools[item.id])}>
        <span aria-hidden="true">{item.icon}</span>{item.name}
      </button>)}
      <button aria-label="平移" aria-pressed={tool === 'hand'} className={tool === 'hand' ? 'active' : ''}
        disabled={disabled} title="平移（H）；按住空格可临时平移" onClick={() => onSelect('hand')}>
        <span aria-hidden="true">✥</span>平移
      </button>
    </div>
  </>;
}

export function ToolModeSelect({ tool, disabled, onSelect }: ToolControlProps) {
  const group = groups.find(item => item.options.some(option => option.tool === tool));
  if (!group) return null;
  return <label className="tool-mode">{group.label}
    <select aria-label={group.label} value={tool} disabled={disabled}
      onChange={event => onSelect(event.target.value as Tool)}>
      {group.options.map(option => <option key={option.tool} value={option.tool}>{option.name}</option>)}
    </select>
  </label>;
}
