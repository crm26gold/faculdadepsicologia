'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Layers, Plus, RotateCw, Sparkles, Trash2 } from 'lucide-react';
import { dateKey, type Flashcard, type Workspace } from '@/lib/workspace';
import { SubjectOptions } from './subject-options';

const defaultCards: Omit<Flashcard, 'id'>[] = [
  {
    subjectId: 'intro',
    front: 'O que caracteriza o "Id" na teoria psicanalítica de Freud?',
    back: 'É a instância psíquica inata e inconsciente, regida pelo princípio do prazer, que busca a gratificação imediata de pulsões e desejos sem considerar a realidade ou a moral.',
    intervalDays: 1,
    repetitionCount: 0,
  },
  {
    subjectId: 'intro',
    front: 'Qual a diferença entre Condicionamento Clássico (Pavlov) e Operante (Skinner)?',
    back: 'O Clássico associa um estímulo neutro a uma resposta involuntária (ex.: salivação). O Operante associa um comportamento voluntário às suas consequências (reforço ou punição).',
    intervalDays: 1,
    repetitionCount: 0,
  },
  {
    subjectId: 'neuro',
    front: 'O que é a Bainha de Mielina e qual sua principal função neural?',
    back: 'É uma camada lipídica que envolve o axônio dos neurônios, cuja função é isolar eletricamente e acelerar a velocidade de condução do impulso nervoso (potencial de ação).',
    intervalDays: 1,
    repetitionCount: 0,
  },
];

export function FlashcardsDeck({
  data,
  blocked,
  update,
}: {
  data: Workspace;
  blocked: boolean;
  update: (recipe: (previous: Workspace) => Workspace) => boolean;
}) {
  const cards = data.flashcards ?? [];
  const subjects = data.subjects ?? [];

  const [selectedSubject, setSelectedSubject] = useState('');
  const [studyMode, setStudyMode] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [subjectId, setSubjectId] = useState(subjects[0]?.id || '');
  const [message, setMessage] = useState('');

  const filteredCards = selectedSubject
    ? cards.filter(c => c.subjectId === selectedSubject)
    : cards;

  const currentCard = filteredCards[currentIndex];

  function seedExamples() {
    if (blocked) return;
    const initial = defaultCards.map(c => ({
      ...c,
      id: crypto.randomUUID(),
      subjectId: subjects.some(s => s.id === c.subjectId) ? c.subjectId : (subjects[0]?.id || ''),
    }));
    update(prev => ({
      ...prev,
      flashcards: [...(prev.flashcards ?? []), ...initial],
    }));
    setMessage('Cartões de exemplo adicionados com sucesso!');
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (blocked || !front.trim() || !back.trim()) return;

    const newCard: Flashcard = {
      id: crypto.randomUUID(),
      subjectId,
      front: front.trim(),
      back: back.trim(),
      intervalDays: 1,
      repetitionCount: 0,
    };

    if (update(prev => ({ ...prev, flashcards: [newCard, ...(prev.flashcards ?? [])] }))) {
      setFront('');
      setBack('');
      setShowAdd(false);
      setMessage('Flashcard criado com sucesso!');
    }
  }

  function handleDelete(id: string) {
    if (blocked || !confirm('Excluir este flashcard?')) return;
    update(prev => ({
      ...prev,
      flashcards: (prev.flashcards ?? []).filter(c => c.id !== id),
    }));
  }

  function handleRate(difficulty: 'hard' | 'good' | 'easy') {
    if (!currentCard || blocked) return;
    const addDaysCount = difficulty === 'hard' ? 1 : difficulty === 'good' ? 3 : 7;
    const nextInterval = currentCard.intervalDays + addDaysCount;

    update(prev => ({
      ...prev,
      flashcards: (prev.flashcards ?? []).map(c =>
        c.id === currentCard.id
          ? {
              ...c,
              lastReviewed: dateKey(),
              intervalDays: nextInterval,
              repetitionCount: c.repetitionCount + 1,
            }
          : c
      ),
    }));

    setFlipped(false);
    if (currentIndex + 1 < filteredCards.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setStudyMode(false);
      setCurrentIndex(0);
      setMessage('Revisão concluída! Excelente dedicação aos estudos.');
    }
  }

  return (
    <section className="flashcards-deck-container">
      <div className="finances-header-row">
        <div>
          <h2>Flashcards · Memorização Ativa</h2>
          <p>Técnica de repetição espaçada para fixar conteúdos antes das provas.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {filteredCards.length > 0 && !studyMode && (
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setStudyMode(true);
                setCurrentIndex(0);
                setFlipped(false);
              }}
            >
              <Sparkles size={16} /> Iniciar Revisão ({filteredCards.length})
            </button>
          )}
          {!studyMode && (
            <button
              type="button"
              className="button outline"
              onClick={() => setShowAdd(!showAdd)}
            >
              <Plus size={16} /> {showAdd ? 'Fechar' : 'Novo cartão'}
            </button>
          )}
        </div>
      </div>

      {message && <p role="status" style={{ fontSize: '0.8rem', color: '#2F6B55', fontWeight: 600 }}>{message}</p>}

      {/* FILTER BY SUBJECT */}
      {!studyMode && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBlock: '8px 16px', flexWrap: 'wrap' }}>
          <label htmlFor="fc-filter" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)' }}>
            Filtrar matéria:
          </label>
          <select
            id="fc-filter"
            value={selectedSubject}
            onChange={e => {
              setSelectedSubject(e.target.value);
              setCurrentIndex(0);
            }}
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--line)', fontSize: '0.8rem', background: '#fff' }}
          >
            <option value="">Todas as matérias ({cards.length})</option>
            <SubjectOptions data={data} label={s => `${s.name} (${cards.filter(c => c.subjectId === s.id).length})`} />
          </select>

          {cards.length === 0 && (
            <button
              type="button"
              className="text-button"
              onClick={seedExamples}
              style={{ fontSize: '0.78rem', fontWeight: 600 }}
            >
              ✨ Carregar exemplos de Psicologia
            </button>
          )}
        </div>
      )}

      {/* ADD FORM */}
      {showAdd && !studyMode && (
        <form onSubmit={handleAdd} className="panel finance-form" style={{ marginBottom: 20 }}>
          <h3>Criar Novo Flashcard</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label htmlFor="fc-subject" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Matéria</label>
              <select
                id="fc-subject"
                value={subjectId}
                onChange={e => setSubjectId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
              >
                <SubjectOptions data={data} />
              </select>
            </div>
            <div>
              <label htmlFor="fc-front" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Frente (Pergunta ou Conceito)</label>
              <textarea
                id="fc-front"
                rows={2}
                required
                maxLength={500}
                value={front}
                onChange={e => setFront(e.target.value)}
                placeholder="Ex.: Qual é o conceito de Zona de Desenvolvimento Proximal de Vygotsky?"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
              />
            </div>
            <div>
              <label htmlFor="fc-back" style={{ fontSize: '0.75rem', fontWeight: 600 }}>Verso (Resposta ou Explicação)</label>
              <textarea
                id="fc-back"
                rows={3}
                required
                maxLength={1000}
                value={back}
                onChange={e => setBack(e.target.value)}
                placeholder="Ex.: É a distância entre o nível de desenvolvimento real e o nível de desenvolvimento potencial..."
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)' }}
              />
            </div>
            <div className="form-footer">
              <button type="button" className="button outline" onClick={() => setShowAdd(false)}>Cancelar</button>
              <button type="submit" className="button primary">Salvar Flashcard</button>
            </div>
          </div>
        </form>
      )}

      {/* ACTIVE STUDY / REVIEW MODE */}
      {studyMode && currentCard ? (
        <div className="flashcard-study-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <button
              type="button"
              className="text-button"
              onClick={() => { setStudyMode(false); setFlipped(false); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <ArrowLeft size={14} /> Sair da revisão
            </button>
            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--muted)' }}>
              Cartão {currentIndex + 1} de {filteredCards.length}
            </span>
          </div>

          <div
            className={`flashcard-big-card ${flipped ? 'flipped' : ''}`}
            onClick={() => setFlipped(!flipped)}
            role="button"
            tabIndex={0}
            aria-label="Toque para virar o cartão"
          >
            <div className="card-face-tag">
              <span>{subjects.find(s => s.id === currentCard.subjectId)?.name || 'Sem matéria'}</span>
              <small>{flipped ? 'Verso (Resposta)' : 'Frente (Pergunta)'}</small>
            </div>
            <div className="card-face-text">
              {flipped ? currentCard.back : currentCard.front}
            </div>
            <div className="card-flip-prompt">
              <RotateCw size={13} /> {flipped ? 'Toque para rever a pergunta' : 'Toque no cartão para ver a resposta'}
            </div>
          </div>

          {flipped && (
            <div className="flashcard-rate-deck">
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--muted)' }}>Como foi sua lembrança?</span>
              <div className="flashcard-rate-buttons">
                <button
                  type="button"
                  className="rate-btn hard"
                  onClick={() => handleRate('hard')}
                >
                  🔴 Difícil (+1 dia)
                </button>
                <button
                  type="button"
                  className="rate-btn good"
                  onClick={() => handleRate('good')}
                >
                  🟡 Bom (+3 dias)
                </button>
                <button
                  type="button"
                  className="rate-btn easy"
                  onClick={() => handleRate('easy')}
                >
                  🟢 Fácil (+7 dias)
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* CARDS GRID LIST */
        <div className="flashcards-grid">
          {filteredCards.map(card => (
            <article key={card.id} className="panel flashcard-item-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <span className="tiny-tag">
                  {subjects.find(s => s.id === card.subjectId)?.name || 'Sem matéria'}
                </span>
                <button
                  type="button"
                  className="icon-button danger"
                  aria-label="Excluir flashcard"
                  onClick={() => handleDelete(card.id)}
                  style={{ width: 28, height: 28 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              <strong style={{ fontSize: '0.85rem', color: 'var(--ink)', display: 'block', marginBottom: 6 }}>
                {card.front}
              </strong>
              <p style={{ fontSize: '0.75rem', color: 'var(--muted)', margin: 0, lineHeight: 1.4 }}>
                {card.back}
              </p>
              {card.repetitionCount > 0 && (
                <div style={{ marginTop: 10, fontSize: '0.65rem', color: '#047857', fontWeight: 600 }}>
                  ✓ Revisado {card.repetitionCount} {card.repetitionCount === 1 ? 'vez' : 'vezes'}
                </div>
              )}
            </article>
          ))}
          {filteredCards.length === 0 && (
            <div className="panel" style={{ padding: 24, textAlign: 'center' }}>
              <Layers size={32} style={{ color: 'var(--muted)', margin: '0 auto 8px' }} />
              <h3>Nenhum flashcard criado ainda</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                Crie cartões de pergunta e resposta para exercitar sua memória antes das provas.
              </p>
              <button
                type="button"
                className="button primary"
                onClick={seedExamples}
                style={{ marginTop: 10 }}
              >
                Carregar exemplos de Psicologia
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
