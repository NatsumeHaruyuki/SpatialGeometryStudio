import { modelGroups, exampleLabels, type ExampleId } from '../geometry/examples';
import { studioStore, useStudio } from '../store/studio';
import { Icon } from './Icon';

export function confirmDiscard() {
  studioStore.getState().setPlaying(false);
  return !studioStore.getState().dirty || window.confirm('当前项目有尚未保存的修改。放弃修改并继续？');
}
export function Sidebar({ open, onClose, onHelp }: { open: boolean; onClose: () => void; onHelp: () => void }) {
  const sceneId = useStudio(s => s.scene.id);
  const problem = useStudio(s => s.scene.problem);
  function switchExample(id: ExampleId) {
    if (!confirmDiscard()) return;
    studioStore.getState().loadExample(id);
    onClose();
  }
  return <aside className={`sidebar ${open ? 'panel-open' : ''}`} aria-label="模型库和题目">
    <div className="brand"><Icon name="cube" size={35} /><div><strong>空间几何工作室</strong><span>Spatial Geometry Studio</span></div></div>
    <div className="sidebar-content">
      <h2>模型库</h2>
      <nav className="model-list" aria-label="示例模型">
        {modelGroups.map(group => <section className="model-family" key={group.label || group.icon}>{group.label ? <h3>{group.label}</h3> : null}{group.models.map(id => <button key={id} className={`model-button ${sceneId === id ? 'active' : ''}`} onClick={() => switchExample(id)} aria-current={sceneId === id ? 'page' : undefined}><Icon name={group.icon} size={24} /><span>{exampleLabels[id]}</span></button>)}</section>)}
      </nav>
      <section className="problem"><h2>题目</h2><p>{problem.text}</p><ul>{problem.conditions.map(condition => <li key={condition}>{condition}</li>)}</ul><p className="problem-note">{problem.note}</p></section>
    </div>
    <div className="sidebar-footer"><button onClick={onHelp}><Icon name="help" size={17} /><span>操作指南</span></button></div>
  </aside>;
}
