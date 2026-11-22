import { useEffect, useMemo } from 'react';
import { studioStore, useStudio } from '../store/studio';
import { Icon } from './Icon';

export function MotionBar() {
  const constructions = useStudio(s => s.scene.constructions);
  const motionId = useStudio(s => s.motionId);
  const playing = useStudio(s => s.playing);
  const motions = useMemo(() => constructions.filter(c => c.kind === 'movingPoint'), [constructions]);
  const active = motions.find(c => c.id === motionId) ?? motions[0];
  useEffect(() => {
    if (!playing || !active) return;
    const started = performance.now();
    const initial = active.t;
    let last = started;
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (now - last < 35) return;
      last = now;
      const phase = (initial + (now - started) / 6500) % 2;
      const t = phase <= 1 ? phase : 2 - phase;
      if (!studioStore.getState().changeMotion(active.id, t, false)) studioStore.getState().setPlaying(false);
    }, 40);
    return () => window.clearInterval(timer);
  }, [playing, active?.id]);
  function togglePlay() {
    if (!active) return;
    if (!playing) studioStore.getState().checkpoint();
    studioStore.getState().setPlaying(!playing);
  }
  return <div className={`motion-bar ${!active ? 'no-motion' : ''}`}>
    <button className="play-button" onClick={togglePlay} disabled={!active} aria-label={playing ? '暂停动点' : '播放动点'} title={playing ? '暂停动点' : '播放动点'}><Icon name={playing ? 'pause' : 'play'} size={21} /></button>
    {active ? <>
      {motions.length > 1 ? <select aria-label="当前动点" value={active.id} onChange={e => studioStore.getState().setMotionId(e.target.value)}>{motions.map(m => <option key={m.id} value={m.id}>动点 {m.label}</option>)}</select> : <span className="motion-name">动点 <em>{active.label}</em></span>}
      <input className="motion-slider" aria-label="动点参数" type="range" min="0" max="1" step="0.005" value={active.t} onPointerDown={() => studioStore.getState().setPlaying(false)} onChange={e => studioStore.getState().changeMotion(active.id, Number(e.target.value))} style={{ '--progress': `${active.t * 100}%` } as React.CSSProperties} />
      <output className="parameter"><i>t</i> = {active.t.toFixed(2)}</output>
      <span className="motion-formula"><i>{active.label} = {active.start.replaceAll('1', '₁')} + t({active.end.replaceAll('1', '₁')} − {active.start.replaceAll('1', '₁')})</i></span>
    </> : <><span className="empty-motion-text">此模型尚未设置动点</span><button className="text-button" onClick={() => studioStore.getState().setTool('movingPoint')}>添加动点<Icon name="chevron" size={14} /></button></>}
  </div>;
}
