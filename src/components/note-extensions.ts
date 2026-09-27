import { Extension, Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { safeMediaSource } from '@/lib/note-media';
import type { SpellingIssue } from '@/lib/spelling';

export const spellingKey = new PluginKey<DecorationSet>('local-spelling');
export const SpellingMarks = Extension.create({
  name: 'localSpelling',
  addProseMirrorPlugins() {
    return [new Plugin({ key: spellingKey, state: {
      init: () => DecorationSet.empty,
      apply(transaction, old) {
        const issues = transaction.getMeta(spellingKey) as SpellingIssue[] | undefined;
        if (issues) return DecorationSet.create(transaction.doc, issues.map(issue => Decoration.inline(issue.from, issue.to, { class: 'spelling-issue', 'data-word': issue.word })));
        return transaction.docChanged ? DecorationSet.empty : old;
      },
    }, props: { decorations: state => spellingKey.getState(state) } })];
  },
});

export const NoteImage = Node.create({
  name: 'noteImage', group: 'block', atom: true, draggable: true,
  addAttributes() { return {
    src: { default: '', parseHTML: el => safeMediaSource(el.getAttribute('src')) },
    alt: { default: 'Imagem da anotação' },
    width: { default: '100%', parseHTML: el => ['50%', '75%', '100%'].includes(el.getAttribute('width') ?? '') ? el.getAttribute('width') : '100%' },
  }; },
  parseHTML() { return [{ tag: 'img[src]', getAttrs: el => safeMediaSource((el as HTMLElement).getAttribute('src')) ? {} : false }]; },
  renderHTML({ node }) { return ['img', { src: safeMediaSource(node.attrs.src), alt: node.attrs.alt, width: node.attrs.width, loading: 'lazy', class: 'note-inline-image' }]; },
});
export const NoteAudio = Node.create({
  name: 'noteAudio', group: 'block', atom: true, draggable: true,
  addAttributes() { return {
    src: { default: '', parseHTML: el => safeMediaSource(el.getAttribute('src')) },
    title: { default: 'Áudio da anotação' },
  }; },
  parseHTML() { return [{ tag: 'audio[src]', getAttrs: el => safeMediaSource((el as HTMLElement).getAttribute('src')) ? {} : false }]; },
  renderHTML({ node }) { return ['audio', { src: safeMediaSource(node.attrs.src), title: node.attrs.title, 'aria-label': node.attrs.title, controls: '', preload: 'none', contenteditable: 'false' }]; },
});
