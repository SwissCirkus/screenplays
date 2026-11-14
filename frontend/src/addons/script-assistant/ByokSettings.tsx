/**
 * "AI key" box for the web version (SwissCirkus fork, Christian 2026-11-15: bring your own key). The writer picks Claude,
 * OpenAI or Gemini, pastes their key and picks a model. The key stays in this browser only.
 * English only on purpose: this box exists only on the SwissCirkus web build. // i18n-ignore
 */
import React, { useEffect, useState } from 'react';
import { CLAUDE_MODELS, PROVIDERS, listModels, useByok, type AiProvider } from '../../services/byokAi';

interface Props { onDone?: () => void }

const ByokSettings: React.FC<Props> = ({ onDone }) => {
  const provider = useByok((s) => s.provider);
  const keys = useByok((s) => s.keys);
  const models = useByok((s) => s.models);
  const { setProvider, setKey, setModel, forget } = useByok.getState();
  const info = PROVIDERS.find((p) => p.id === provider)!;
  const saved = keys[provider] ?? '';
  const [draft, setDraft] = useState(saved);
  const [list, setList] = useState<{ id: string; label: string }[]>(provider === 'anthropic' ? CLAUDE_MODELS : []);
  const [status, setStatus] = useState<string>('');

  useEffect(() => { setDraft(keys[provider] ?? ''); setStatus(''); setList(provider === 'anthropic' ? CLAUDE_MODELS : []); }, [provider]); // eslint-disable-line react-hooks/exhaustive-deps

  // With a saved key, ask the provider which models it can use.
  useEffect(() => {
    if (!saved) return;
    let live = true;
    setStatus('Checking the key…'); // i18n-ignore: web-only
    listModels(provider, saved)
      .then((found) => {
        if (!live) return;
        if (provider === 'anthropic') {
          // Keep the three current models first; then anything else the key lists.
          const extra = found.filter((m) => !CLAUDE_MODELS.some((c) => c.id === m.id));
          setList([...CLAUDE_MODELS, ...extra]);
        } else {
          setList(found);
          if (!useByok.getState().models[provider] && found[0]) setModel(provider, found[0].id);
        }
        setStatus('Key works.'); // i18n-ignore: web-only
      })
      .catch((err) => { if (live) setStatus(err instanceof Error ? err.message : String(err)); });
    return () => { live = false; };
  }, [provider, saved]); // eslint-disable-line react-hooks/exhaustive-deps

  const model = models[provider] || info.defaultModel;

  return (
    <div className="sa-byok">
      <p className="sa-byok-intro">
        {/* i18n-ignore */}Online, the Assistant uses your own AI key. It is kept only in this browser and goes straight to the provider — never to Drive or our server. Inside Kontroll, Kontroll&apos;s own models are used instead.
      </p>
      <label className="sa-byok-row">
        <span>{'Provider' /* i18n-ignore */}</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
          {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <form
        className="sa-byok-row"
        onSubmit={(e) => { e.preventDefault(); setKey(provider, draft); }}
      >
        <span>{'Key' /* i18n-ignore */}</span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          placeholder={info.keyHint}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`${info.label} key`} // i18n-ignore: web-only
        />
        <button type="submit" className="sa-btn primary" disabled={!draft.trim() || draft.trim() === saved}>{'Save' /* i18n-ignore */}</button>
      </form>
      <div className="sa-byok-links">
        <a href={info.keyUrl} target="_blank" rel="noreferrer">{`Get a ${info.label} key` /* i18n-ignore */}</a>
        {saved && <button type="button" className="sa-link-btn" onClick={() => { forget(provider); setDraft(''); setStatus(''); }}>{'Forget this key' /* i18n-ignore */}</button>}
      </div>
      {saved && (
        <label className="sa-byok-row">
          <span>{'Model' /* i18n-ignore */}</span>
          {list.length > 0 ? (
            <select value={model} onChange={(e) => setModel(provider, e.target.value)}>
              {!list.some((m) => m.id === model) && model && <option value={model}>{model}</option>}
              {list.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          ) : (
            <input value={model} placeholder="model name" onChange={(e) => setModel(provider, e.target.value.trim())} /> // i18n-ignore: web-only
          )}
        </label>
      )}
      {status && <div className="sa-byok-status">{status}</div>}
      {saved && onDone && <button type="button" className="sa-btn" onClick={onDone}>{'Done' /* i18n-ignore */}</button>}
    </div>
  );
};

export default ByokSettings;
