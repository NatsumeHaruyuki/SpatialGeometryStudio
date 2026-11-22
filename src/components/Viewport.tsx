import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { GeometryView } from '../rendering/GeometryView';
import { studioStore, useStudio, type Selection } from '../store/studio';
import type { Scene } from '../schema/scene';

export type ViewportApi = { getView: () => Scene['view']; capturePNG: () => string; reset: () => void };
export const Viewport = forwardRef<ViewportApi>(function Viewport(_, ref) {
  const host = useRef<HTMLDivElement>(null);
  const axes = useRef<SVGSVGElement>(null);
  const view = useRef<GeometryView | null>(null);
  const homeView = useRef(studioStore.getState().scene.view);
  const [error, setError] = useState('');
  const scene = useStudio(s => s.scene);
  const selection = useStudio(s => s.selection);
  const tool = useStudio(s => s.tool);
  const viewRevision = useStudio(s => s.viewRevision);
  useEffect(() => {
    const element = host.current!;
    const onError = (event: Event) => setError((event as CustomEvent).detail);
    element.addEventListener('scene-error', onError);
    try {
      view.current = new GeometryView(element, (picked: Selection, multi: boolean) => studioStore.getState().pick(picked, multi), axes.current, next => studioStore.getState().changeView(next), {
        point: (id, position, first) => studioStore.getState().updatePoint(id, position, first),
        section: (id, offset, first) => studioStore.getState().moveSection(id, offset, first),
      });
      const state = studioStore.getState();
      view.current.update(state.scene, state.selection, state.tool);
      view.current.setView(state.scene.view);
    } catch (error) { setError(error instanceof Error ? error.message : '此设备无法初始化三维渲染'); }
    return () => { element.removeEventListener('scene-error', onError); view.current?.dispose(); view.current = null; };
  }, []);
  useEffect(() => { view.current?.update(scene, selection, tool); }, [scene, selection, tool]);
  useEffect(() => { homeView.current = studioStore.getState().scene.view; view.current?.setView(homeView.current); }, [viewRevision]);
  useImperativeHandle(ref, () => ({
    getView: () => view.current?.getView() ?? studioStore.getState().scene.view,
    capturePNG: () => { if (!view.current) throw new Error('三维画布尚未就绪'); return view.current.capturePNG(); },
    reset: () => { view.current?.setView(homeView.current); if (view.current) studioStore.getState().changeView(view.current.getView()); },
  }), []);
  return <div className={`viewport ${tool !== 'select' ? 'constructing' : ''} ${tool === 'adjust' ? 'adjusting' : ''}`}>
    <div ref={host} className="webgl-host" data-testid="viewport" />
    {error ? <div className="canvas-error"><h2>三维画布暂不可用</h2><p>{error}</p><p>请确认显卡驱动支持 WebGL 2，保存项目后重启。</p></div> : null}
    <div className="canvas-guide" aria-hidden="true">
      <svg ref={axes} className="axis-widget" viewBox="0 0 85 75">
        {['#b97368', '#569382', '#5e83b0'].map((color, i) => <g key={color} stroke={color} fill={color}><line data-axis={i} x1="40" y1="40" x2="40" y2="40" strokeWidth="1.8" /><text data-axis-label={i} x="40" y="40" stroke="none" fontSize="13" fontFamily="Georgia">{['x', 'y', 'z'][i]}</text></g>)}
      </svg>
      <span>旋转：左键 <b>·</b> 平移：右键 <b>·</b> Alt 拖截面 <b>·</b> 滚轮缩放</span>
    </div>
  </div>;
});
