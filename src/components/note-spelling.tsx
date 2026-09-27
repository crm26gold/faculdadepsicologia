'use client';
import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { spellingTokens, type SpellingIssue } from '@/lib/spelling';
import { spellingKey } from './note-extensions';

export function NoteSpelling({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const worker = useRef<Worker | null>(null);
  const ignored = useRef(new Set<string>());
  const [issues, setIssues] = useState<SpellingIssue[]>([]);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('Preparando dicionário…');
  const [chosen, setChosen] = useState<SpellingIssue | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const selected = useRef<SpellingIssue | null>(null);
  const rescan = useRef<() => void>(() => {});
  useEffect(() => {
    const instance = new Worker('/spelling/worker.js', { type: 'module' });
    worker.current = instance;
    let timer: ReturnType<typeof setTimeout>;
    let generation = 0;
    let tokens: SpellingIssue[] = [];
    function scan() {
      generation++;
      setIssues([]); setChosen(null); selected.current = null; setSuggestions([]);
      clearTimeout(timer);
      editor.view.dispatch(editor.state.tr.setMeta(spellingKey, []));
      timer = setTimeout(() => {
        tokens = [];
        editor.state.doc.descendants((node, pos, parent) => {
          if (node.isText && parent?.type.name !== 'codeBlock' && !node.marks.some(mark => ['code', 'link'].includes(mark.type.name))) tokens.push(...spellingTokens(node.text!, pos));
        });
        instance.postMessage({ kind: 'check', id: generation, words: tokens.map(token => token.word).filter(word => !ignored.current.has(word)) });
      }, 800);
    }
    rescan.current = scan;
    instance.onmessage = ({ data }) => {
      if (editor.isDestroyed) return;
      if (data.kind === 'error') { setStatus('Corretor local indisponível. Reabra o caderno para tentar novamente.'); return; }
      if (data.kind === 'suggest') {
        if (data.word === selected.current?.word) setSuggestions(data.suggestions);
        return;
      }
      if (data.id !== generation) return;
      const wrong = new Set(data.incorrect);
      const found = tokens.filter(token => wrong.has(token.word) && !ignored.current.has(token.word));
      setIssues(found);
      setStatus(found.length ? `${found.length} palavras para revisar` : 'Nenhuma sugestão ortográfica');
      editor.view.dispatch(editor.state.tr.setMeta(spellingKey, found));
    };
    instance.onerror = () => setStatus('Não foi possível iniciar o corretor local.');
    scan(); editor.on('update', scan);
    return () => { clearTimeout(timer); editor.off('update', scan); instance.terminate(); worker.current = null; };
  }, [editor]);
  function choose(issue: SpellingIssue) {
    selected.current = issue; setChosen(issue); setSuggestions([]);
    editor.commands.setTextSelection({ from: issue.from, to: issue.to });
    worker.current?.postMessage({ kind: 'suggest', id: 0, word: issue.word });
  }
  function replace(word: string) {
    if (!chosen || disabled || editor.state.doc.textBetween(chosen.from, chosen.to) !== chosen.word) return;
    const marks = editor.state.doc.nodeAt(chosen.from)?.marks;
    editor.view.dispatch(editor.state.tr.replaceWith(chosen.from, chosen.to, editor.schema.text(word, marks)));
    editor.commands.focus();
  }
  return <section className="spelling-panel" aria-label="Revisão ortográfica">
    <button className="text-button" aria-expanded={open} onClick={() => setOpen(!open)}>Ortografia · Português (Brasil) {issues.length > 0 ? `(${issues.length})` : ''}</button>
    {open && <div><p role="status">{status}. As sugestões são locais e só mudam o texto quando você escolhe.</p>
      <div className="spelling-words">{issues.slice(0, 30).map(issue => <button key={`${issue.from}:${issue.word}`} className="button outline" disabled={disabled} onClick={() => choose(issue)}>{issue.word}</button>)}</div>
      {chosen && <div className="spelling-suggestions"><strong>Sugestões para “{chosen.word}”</strong><div className="button-row">{suggestions.map(word => <button key={word} className="button outline" disabled={disabled} onClick={() => replace(word)}>{word}</button>)}<button className="text-button" onClick={() => { ignored.current.add(chosen.word); rescan.current(); }}>Ignorar nesta sessão</button></div><small>Não é revisão gramatical. Nomes próprios e termos técnicos podem ser sinalizados.</small></div>}
    </div>}
  </section>;
}
