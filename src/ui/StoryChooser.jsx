import { useState } from 'react';
import { SCENARIOS, getScenario } from '../simulation/scenarios.js';
import { useLanguage } from './Language.jsx';
import Dialog from './Dialog.jsx';

export default function StoryChooser({ game, firstVisit, onChoose, onClose, busy }) {
  const { language, setLanguage, t } = useLanguage();
  const [chosen, setChosen] = useState(getScenario(game).id);
  const scene = getScenario(chosen),
    fresh = chosen !== getScenario(game).id;
  return (
    <Dialog
      className="story-chooser"
      title={t(
        firstVisit ? '欢迎来到耳语镇' : '换一段小镇生活',
        firstVisit ? 'Welcome to Whisperville' : 'Choose a different day',
      )}
      onClose={onClose}
    >
      <div className="welcome-lead">
        <p>
          {t(
            '你是小镇的观察者。跟随一个人，看 TA 遇见谁、记住什么，再轻轻改变故事。',
            'You are the observer. Follow a neighbor, see who they meet and what they remember, then gently change the story.',
          )}
        </p>
        <button
          className="secondary-button"
          onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
        >
          {language === 'zh' ? 'English' : '中文'}
        </button>
      </div>
      <div className="welcome-controls">
        <span>
          <b>↔</b>
          {t('按住地图拖动', 'Drag the map')}
        </span>
        <span>
          <b>⊕</b>
          {t('滚轮／＋－缩放', 'Wheel / + − to zoom')}
        </span>
        <span>
          <b>◉</b>
          {t('点居民看手记', 'Select a neighbor')}
        </span>
        <span>
          <b>▷</b>
          {t('先用「观察下一段」', 'Try “Next segment” first')}
        </span>
      </div>
      <p className="story-prompt">
        {t('今天，想观察什么？', 'What would you like to observe today?')}
      </p>
      <div
        className="story-choices"
        role="radiogroup"
        aria-label={t('选择生活场景', 'Choose a scenario')}
      >
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={s.id === chosen}
            className={s.id === chosen ? 'selected' : ''}
            onClick={() => setChosen(s.id)}
          >
            <span className="story-symbol" aria-hidden="true">
              {s.symbol}
            </span>
            <div>
              <strong>{t(s.title, s.titleEn)}</strong>
              <p>{t(s.subtitle, s.subtitleEn)}</p>
            </div>
            <span className="story-radio" aria-hidden="true">
              {s.id === chosen ? '●' : '○'}
            </span>
          </button>
        ))}
      </div>
      <p className="muted">
        {t(
          '想看清传播：先选学校或找猫，再点「传播图谱」，沿卡片箭头追溯来源、拖动时间轴看变化。',
          'To inspect diffusion, choose School or Missing Cat, open Propagation, follow message arrows and scrub the timeline.',
        )}
      </p>
      <div className="story-question">
        <span>{t('可以留意', 'LOOK FOR')}</span>
        <p>{t(scene.question, scene.questionEn)}</p>
      </div>
      <p className="muted">
        {t(
          '未接 API 也能体验规则演示；接入后，模型会根据记忆选择行动和对话。场景开局是预设的。',
          'Rules work without an API. A connected model chooses actions and dialogue from personal memories. Each scenario has a predefined starting situation.',
        )}
      </p>
      {fresh && game.round > 0 && (
        <p className="muted">
          {t(
            '切换场景会开启新的一天，并重置当前进度；可先在设置中导出。',
            'Switching starts a new day and resets this run. Export it in Settings first if needed.',
          )}
        </p>
      )}
      <div className="dialog-actions">
        <button className="primary-button" disabled={busy} onClick={() => onChoose(chosen)}>
          {t(fresh ? '开启这一天' : '进入小镇', fresh ? 'Start this day' : 'Enter the town')} →
        </button>
      </div>
    </Dialog>
  );
}
