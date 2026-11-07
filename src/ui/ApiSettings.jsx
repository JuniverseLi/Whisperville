import { useEffect, useState } from 'react';
import { useLanguage } from './Language.jsx';

export default function ApiSettings({ onSaved, busy }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    baseUrl: '',
    model: '',
    apiKey: '',
    maxCalls: 12,
  });
  const [hasKey, setHasKey] = useState(false),
    [pending, setPending] = useState(false),
    [status, setStatus] = useState(''),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => {
        setForm({
          baseUrl: data.baseUrl,
          model: data.model,
          apiKey: '',
          maxCalls: Math.min(50, data.maxCalls || 12),
        });
        setHasKey(data.hasApiKey);
        setLoaded(true);
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setStatus('load-failed');
      });
    return () => controller.abort();
  }, []);
  const messages = {
    saved: t(
      '配置已保存，下一段观察即可使用。',
      'Saved. The next segment will use this configuration.',
    ),
    connected: t(
      '连接成功，可以保存配置了。',
      'Connection successful. You can save this configuration.',
    ),
    'load-failed': t(
      '无法读取本地配置，请检查本地服务。',
      'Unable to load settings. Check the local server.',
    ),
    'invalid-settings': t(
      '请检查地址、模型、密钥和预算。更换地址时需要重新填密钥。',
      'Check the endpoint, model, key and budget. Enter a key when changing endpoints.',
    ),
    'connection-failed': t(
      '连接失败，请检查地址、模型名称和密钥。',
      'Connection failed. Check the endpoint, model name and key.',
    ),
    'budget-exceeded': t('本地请求预算已用完。', 'The local request budget is exhausted.'),
    'save-failed': t('无法保存本地配置。', 'Unable to save local settings.'),
  };
  async function submit(test) {
    setPending(true);
    setStatus('');
    try {
      const response = await fetch(test ? '/api/config/test' : '/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.code || 'connection-failed');
        return;
      }
      setStatus(test ? 'connected' : 'saved');
      if (!test) {
        setHasKey(data.hasApiKey);
        setForm((value) => ({ ...value, apiKey: '' }));
        onSaved({ mode: data.enabled ? 'ai' : 'demo', model: data.model, maxCalls: data.maxCalls });
      }
    } catch {
      setStatus('connection-failed');
    } finally {
      setPending(false);
    }
  }
  const field = (name, value) => {
    setForm((previous) => ({ ...previous, [name]: value }));
    setStatus('');
  };
  return (
    <form
      className="api-settings"
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
    >
      <p>
        {t(
          '兼容 Chat Completions 的接口。保存后立即生效，无须重启。',
          'Connect a Chat Completions compatible API. Saved changes take effect immediately.',
        )}
      </p>
      <label>
        Base URL
        <input
          required
          type="url"
          name="baseUrl"
          placeholder="http://localhost:11434/v1"
          value={form.baseUrl}
          onChange={(e) => field('baseUrl', e.target.value)}
          autoComplete="off"
        />
      </label>
      <label>
        {t('模型名称', 'Model')}
        <input
          required
          name="model"
          placeholder="your-model-name"
          value={form.model}
          onChange={(e) => field('model', e.target.value)}
          autoComplete="off"
        />
      </label>
      <label>
        API Key
        <input
          type="password"
          name="apiKey"
          placeholder={
            hasKey
              ? t('已保存；留空保留', 'Saved; leave blank to keep')
              : t(
                  '填入密钥；无鉴权的本地服务可填 local',
                  'Enter a key; use local for a keyless local server',
                )
          }
          value={form.apiKey}
          onChange={(e) => field('apiKey', e.target.value)}
          autoComplete="new-password"
        />
      </label>
      <label>
        {t('每次观察的模型请求上限', 'Model request limit per observation')}
        <input
          required
          type="number"
          name="maxCalls"
          min="1"
          max="50"
          value={form.maxCalls}
          onChange={(e) => field('maxCalls', Number(e.target.value))}
        />
      </label>
      <p className="muted">
        {t(
          '密钥只保存在本机服务端。每次请求只有一位居民的上下文；四句交流使用 4 次，个人规划使用 1 次，失败也计入。额度不足或返回无效时暂停，不生成替代内容。每次输入、原始返回和用量均保存到本机审计记录。测试连接另用一次轻量请求。',
          'Keys stay on the local server. Each request contains one resident. Four-turn dialogue uses 4 requests; personal planning uses 1. Failures count too. Insufficient budget or invalid output pauses observation without substitute content. Requests, raw responses and usage are audited locally. Connection testing uses one additional small request.',
        )}
      </p>
      {status && (
        <p className="api-result" role="status">
          {messages[status] || messages['connection-failed']}
        </p>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={!loaded || pending || busy}
          onClick={() => submit(true)}
        >
          {pending ? t('请求中…', 'Working…') : t('测试连接', 'Test connection')}
        </button>
        <button className="primary-button" disabled={!loaded || pending || busy}>
          {t('保存配置', 'Save configuration')}
        </button>
      </div>
    </form>
  );
}
