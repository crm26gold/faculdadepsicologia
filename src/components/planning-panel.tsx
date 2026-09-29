'use client';

import { useState, type FormEvent } from 'react';
import {
  Archive,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FolderGit2,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { formatDate, type Goal, type Project, type Task, type Workspace } from '@/lib/workspace';
import { goalProgress, projectProgress, linkTaskToProject } from '@/lib/planning';
import { lifeAreas } from '@/lib/life';
import { AreaSelect } from './life-organization';
import { Modal } from './modal';

type PlanningProps = {
  data: Workspace;
  blocked: boolean;
  update: (recipe: (previous: Workspace) => Workspace) => boolean;
};

type StatusFilter = 'all' | 'active' | 'paused' | 'completed' | 'archived';

export function PlanningPanel({ data, blocked, update }: PlanningProps) {
  const [activeTab, setActiveTab] = useState<'goals' | 'projects'>('goals');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [areaFilter, setAreaFilter] = useState<string>('');
  const [projectGoalFilter, setProjectGoalFilter] = useState<string>('');
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [feedbackNotice, setFeedbackNotice] = useState<string>('');

  const goals = data.goals ?? [];
  const projects = data.projects ?? [];
  const areas = lifeAreas(data);

  // Filtered lists
  const filteredGoals = goals.filter((g) => {
    if (statusFilter !== 'all' && g.status !== statusFilter) return false;
    if (areaFilter && g.areaId !== areaFilter) return false;
    return true;
  });

  const filteredProjects = projects.filter((p) => {
    if (statusFilter !== 'all' && p.status !== statusFilter) return false;
    if (areaFilter && p.areaId !== areaFilter) return false;
    if (projectGoalFilter && p.goalId !== projectGoalFilter) return false;
    return true;
  });

  function showNotice(msg: string) {
    setFeedbackNotice(msg);
    setTimeout(() => setFeedbackNotice(''), 4000);
  }

  // Goal actions
  function updateGoalStatus(goal: Goal, status: Goal['status']) {
    if (status === 'archived') {
      const confirmArchive = window.confirm(
        'Arquivar esta meta? Seus projetos e tarefas vinculados serão preservados.',
      );
      if (!confirmArchive) return;
    }
    const success = update((prev) => ({
      ...prev,
      goals: (prev.goals ?? []).map((g) => (g.id === goal.id ? { ...g, status } : g)),
    }));
    if (success) {
      const label =
        status === 'archived'
          ? 'Meta arquivada.'
          : status === 'completed'
          ? 'Meta marcada como concluída.'
          : status === 'paused'
          ? 'Meta pausada.'
          : 'Meta reativada.';
      showNotice(label);
    }
  }

  // Project actions
  function updateProjectStatus(project: Project, status: Project['status']) {
    if (status === 'archived') {
      const confirmArchive = window.confirm(
        'Arquivar este projeto? Suas tarefas e anotações vinculadas serão preservadas.',
      );
      if (!confirmArchive) return;
    }
    const success = update((prev) => ({
      ...prev,
      projects: (prev.projects ?? []).map((p) => (p.id === project.id ? { ...p, status } : p)),
    }));
    if (success) {
      const label =
        status === 'archived'
          ? 'Projeto arquivado.'
          : status === 'completed'
          ? 'Projeto concluído.'
          : status === 'paused'
          ? 'Projeto pausado.'
          : 'Projeto reativado.';
      showNotice(label);
    }
  }

  function toggleProjectTasks(projectId: string) {
    setExpandedProjects((prev) => ({ ...prev, [projectId]: !prev[projectId] }));
  }

  function toggleTaskDone(task: Task) {
    update((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)),
    }));
  }

  function unlinkTask(task: Task) {
    const success = update((prev) => linkTaskToProject(prev, task.id, undefined));
    if (success) {
      showNotice('Tarefa desvinculada do projeto.');
    } else {
      showNotice('Não foi possível desvincular a tarefa. Tente novamente.');
    }
  }

  return (
    <section className="planning-container" aria-label="Planejamento de Metas e Projetos">
      <header className="planning-header">
        <div className="planning-title-block">
          <div className="planning-badge">
            <Target size={15} aria-hidden="true" />
            <span>Direção e Ação</span>
          </div>
          <h2>Metas e Projetos</h2>
          <p>
            Metas orientam onde você quer chegar. Projetos transformam intenções em passos práticos.
            Tarefas concluídas mostram o esforço operacional do projeto, sem substituir a medição da
            meta.
          </p>
        </div>

        <div className="planning-header-actions">
          <button
            type="button"
            className="button outline"
            disabled={blocked}
            onClick={() => {
              setEditingProject(null);
              setProjectModalOpen(true);
            }}
          >
            <Plus size={16} aria-hidden="true" />
            <span>Novo projeto</span>
          </button>
          <button
            type="button"
            className="button primary"
            disabled={blocked}
            onClick={() => {
              setEditingGoal(null);
              setGoalModalOpen(true);
            }}
          >
            <Plus size={16} aria-hidden="true" />
            <span>Nova meta</span>
          </button>
        </div>
      </header>

      {/* Tabs and counts */}
      <div className="planning-nav-bar" role="tablist" aria-label="Seções de planejamento">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'goals'}
          className={`planning-tab ${activeTab === 'goals' ? 'active' : ''}`}
          onClick={() => setActiveTab('goals')}
        >
          <Target size={16} aria-hidden="true" />
          <span>Metas</span>
          <span className="count-pill">{goals.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'projects'}
          className={`planning-tab ${activeTab === 'projects' ? 'active' : ''}`}
          onClick={() => setActiveTab('projects')}
        >
          <FolderGit2 size={16} aria-hidden="true" />
          <span>Projetos</span>
          <span className="count-pill">{projects.length}</span>
        </button>
      </div>

      {/* Filters bar */}
      <div className="planning-filters-bar">
        <div className="filter-group">
          <label htmlFor="planning-status-filter">Status:</label>
          <select
            id="planning-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="paused">Pausados</option>
            <option value="completed">Concluídos</option>
            <option value="archived">Arquivados</option>
          </select>
        </div>

        <div className="filter-group">
          <label htmlFor="planning-area-filter">Área da vida:</label>
          <select
            id="planning-area-filter"
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
          >
            <option value="">Todas as áreas</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {activeTab === 'projects' && (
          <div className="filter-group">
            <label htmlFor="planning-goal-filter">Meta vinculada:</label>
            <select
              id="planning-goal-filter"
              value={projectGoalFilter}
              onChange={(e) => setProjectGoalFilter(e.target.value)}
            >
              <option value="">Todas as metas</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {feedbackNotice && (
        <div className="toast" role="status">
          <Check size={16} aria-hidden="true" />
          <span>{feedbackNotice}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dispensar aviso"
            onClick={() => setFeedbackNotice('')}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === 'goals' && (
        <div className="planning-tab-content">
          {filteredGoals.length === 0 ? (
            <div className="empty-state planning-empty">
              <Target size={44} aria-hidden="true" />
              <h3>
                {goals.length === 0
                  ? 'Nenhuma meta definida ainda'
                  : 'Nenhuma meta encontrada com os filtros selecionados'}
              </h3>
              <p>
                {goals.length === 0
                  ? 'Metas estabelecem para onde você quer direcionar sua energia e evolução.'
                  : 'Tente alterar os filtros de status ou área para ver outras metas.'}
              </p>
              {goals.length === 0 && (
                <button
                  type="button"
                  className="button primary"
                  disabled={blocked}
                  onClick={() => {
                    setEditingGoal(null);
                    setGoalModalOpen(true);
                  }}
                >
                  <Plus size={16} aria-hidden="true" /> Criar primeira meta
                </button>
              )}
            </div>
          ) : (
            <div className="planning-card-grid">
              {filteredGoals.map((goal) => {
                const percent = goalProgress(goal);
                const area = areas.find((a) => a.id === goal.areaId);
                const linkedProjects = projects.filter((p) => p.goalId === goal.id);

                return (
                  <article key={goal.id} className={`planning-card goal-card status-${goal.status}`}>
                    <div className="card-top-row">
                      <div className="badge-row">
                        <span className={`status-pill pill-${goal.status}`}>
                          {goal.status === 'active'
                            ? 'Ativa'
                            : goal.status === 'paused'
                            ? 'Pausada'
                            : goal.status === 'completed'
                            ? 'Concluída'
                            : 'Arquivada'}
                        </span>
                        {area && (
                          <span className="area-pill">
                            <i className={`color-dot ${area.color}`} />
                            {area.name}
                          </span>
                        )}
                      </div>
                      <div className="card-action-menu">
                        <button
                          type="button"
                          className="button outline small-btn"
                          disabled={blocked}
                          aria-label={`Editar meta: ${goal.title}`}
                          onClick={() => {
                            setEditingGoal(goal);
                            setGoalModalOpen(true);
                          }}
                        >
                          Editar
                        </button>
                      </div>
                    </div>

                    <h3 className="card-title">{goal.title}</h3>
                    {goal.description && <p className="card-desc">{goal.description}</p>}

                    {goal.deadline && (
                      <div className="card-meta-line">
                        <small>Prazo: {formatDate(goal.deadline)}</small>
                      </div>
                    )}

                    {/* Metric indicator */}
                    <div className="metric-deck">
                      <div className="metric-deck-header">
                        <span className="metric-deck-label">Medição da meta</span>
                        <span className="metric-deck-value">
                          {percent !== null
                            ? `${goal.metric!.current} de ${goal.metric!.target} ${goal.metric!.unit} (${percent}%)`
                            : 'Sem medição'}
                        </span>
                      </div>
                      {percent !== null && (
                        <progress
                          className="planning-progress"
                          value={percent}
                          max={100}
                          aria-label={`Medição da meta: ${percent}%`}
                        />
                      )}
                    </div>

                    {/* Linked projects info */}
                    <div className="card-linked-summary">
                      <Layers size={14} aria-hidden="true" />
                      <span>
                        {linkedProjects.length === 0
                          ? 'Nenhum projeto vinculado'
                          : linkedProjects.length === 1
                          ? '1 projeto vinculado'
                          : `${linkedProjects.length} projetos vinculados`}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="card-actions-bar">
                      {goal.status === 'active' && (
                        <>
                          <button
                            type="button"
                            className="status-btn"
                            disabled={blocked}
                            onClick={() => updateGoalStatus(goal, 'paused')}
                            title="Pausar meta"
                          >
                            <Pause size={14} aria-hidden="true" /> Pausar
                          </button>
                          <button
                            type="button"
                            className="status-btn finish"
                            disabled={blocked}
                            onClick={() => updateGoalStatus(goal, 'completed')}
                            title="Concluir meta"
                          >
                            <CheckCircle2 size={14} aria-hidden="true" /> Concluir
                          </button>
                          <button
                            type="button"
                            className="status-btn danger"
                            disabled={blocked}
                            onClick={() => updateGoalStatus(goal, 'archived')}
                            title="Arquivar meta"
                          >
                            <Archive size={14} aria-hidden="true" /> Arquivar
                          </button>
                        </>
                      )}
                      {goal.status === 'paused' && (
                        <>
                          <button
                            type="button"
                            className="status-btn"
                            disabled={blocked}
                            onClick={() => updateGoalStatus(goal, 'active')}
                            title="Reabrir meta"
                          >
                            <Play size={14} aria-hidden="true" /> Reabrir
                          </button>
                          <button
                            type="button"
                            className="status-btn finish"
                            disabled={blocked}
                            onClick={() => updateGoalStatus(goal, 'completed')}
                            title="Concluir meta"
                          >
                            <CheckCircle2 size={14} aria-hidden="true" /> Concluir
                          </button>
                          <button
                            type="button"
                            className="status-btn danger"
                            disabled={blocked}
                            onClick={() => updateGoalStatus(goal, 'archived')}
                            title="Arquivar meta"
                          >
                            <Archive size={14} aria-hidden="true" /> Arquivar
                          </button>
                        </>
                      )}
                      {goal.status === 'completed' && (
                        <>
                          <button
                            type="button"
                            className="status-btn"
                            disabled={blocked}
                            onClick={() => updateGoalStatus(goal, 'active')}
                            title="Reabrir meta"
                          >
                            <RotateCcw size={14} aria-hidden="true" /> Reabrir
                          </button>
                          <button
                            type="button"
                            className="status-btn danger"
                            disabled={blocked}
                            onClick={() => updateGoalStatus(goal, 'archived')}
                            title="Arquivar meta"
                          >
                            <Archive size={14} aria-hidden="true" /> Arquivar
                          </button>
                        </>
                      )}
                      {goal.status === 'archived' && (
                        <button
                          type="button"
                          className="status-btn"
                          disabled={blocked}
                          onClick={() => updateGoalStatus(goal, 'active')}
                          title="Restaurar meta para ativa"
                        >
                          <RotateCcw size={14} aria-hidden="true" /> Restaurar meta
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Projects Tab Content */}
      {activeTab === 'projects' && (
        <div className="planning-tab-content">
          {filteredProjects.length === 0 ? (
            <div className="empty-state planning-empty">
              <FolderGit2 size={44} aria-hidden="true" />
              <h3>
                {projects.length === 0
                  ? 'Nenhum projeto cadastrado ainda'
                  : 'Nenhum projeto encontrado com os filtros selecionados'}
              </h3>
              <p>
                {projects.length === 0
                  ? 'Projetos organizam suas tarefas e entregas em torno de um objetivo claro.'
                  : 'Tente alterar os filtros de status, área ou meta vinculada.'}
              </p>
              {projects.length === 0 && (
                <button
                  type="button"
                  className="button primary"
                  disabled={blocked}
                  onClick={() => {
                    setEditingProject(null);
                    setProjectModalOpen(true);
                  }}
                >
                  <Plus size={16} aria-hidden="true" /> Criar primeiro projeto
                </button>
              )}
            </div>
          ) : (
            <div className="planning-card-grid">
              {filteredProjects.map((project) => {
                const operational = projectProgress(data, project.id);
                const area = areas.find((a) => a.id === project.areaId);
                const parentGoal = goals.find((g) => g.id === project.goalId);
                const projectTasks = data.tasks.filter((t) => t.projectId === project.id);
                const isExpanded = !!expandedProjects[project.id];

                return (
                  <article
                    key={project.id}
                    className={`planning-card project-card status-${project.status}`}
                  >
                    <div className="card-top-row">
                      <div className="badge-row">
                        <span className={`status-pill pill-${project.status}`}>
                          {project.status === 'active'
                            ? 'Ativo'
                            : project.status === 'paused'
                            ? 'Pausado'
                            : project.status === 'completed'
                            ? 'Concluído'
                            : 'Arquivado'}
                        </span>
                        {area && (
                          <span className="area-pill">
                            <i className={`color-dot ${area.color}`} />
                            {area.name}
                          </span>
                        )}
                      </div>
                      <div className="card-action-menu">
                        <button
                          type="button"
                          className="button outline small-btn"
                          disabled={blocked}
                          aria-label={`Editar projeto: ${project.title}`}
                          onClick={() => {
                            setEditingProject(project);
                            setProjectModalOpen(true);
                          }}
                        >
                          Editar
                        </button>
                      </div>
                    </div>

                    <h3 className="card-title">{project.title}</h3>
                    {project.description && <p className="card-desc">{project.description}</p>}

                    <div className="card-parent-link">
                      <Target size={13} aria-hidden="true" />
                      {parentGoal ? (
                        <span>
                          Meta: <strong>{parentGoal.title}</strong>
                          {parentGoal.status === 'archived' && ' (arquivada)'}
                        </span>
                      ) : (
                        <span className="muted">Sem meta vinculada</span>
                      )}
                    </div>

                    {project.deadline && (
                      <div className="card-meta-line">
                        <small>Prazo: {formatDate(project.deadline)}</small>
                      </div>
                    )}

                    {/* Operational Progress Deck */}
                    <div className="metric-deck">
                      <div className="metric-deck-header">
                        <span className="metric-deck-label">Tarefas concluídas</span>
                        <span className="metric-deck-value">
                          {operational.percent !== null
                            ? `${operational.done}/${operational.total} concluídas (${operational.percent}%)`
                            : 'Sem tarefas'}
                        </span>
                      </div>
                      {operational.percent !== null && (
                        <progress
                          className="planning-progress"
                          value={operational.done}
                          max={operational.total}
                          aria-label={`Tarefas concluídas: ${operational.percent}%`}
                        />
                      )}
                    </div>

                    {/* Project Tasks Accordion */}
                    <div className="project-tasks-section">
                      <button
                        type="button"
                        className="project-tasks-toggle"
                        onClick={() => toggleProjectTasks(project.id)}
                        aria-expanded={isExpanded}
                      >
                        <span>
                          {projectTasks.length === 0
                            ? 'Nenhuma tarefa vinculada'
                            : `${projectTasks.length} ${
                                projectTasks.length === 1 ? 'tarefa no projeto' : 'tarefas no projeto'
                              }`}
                        </span>
                        {projectTasks.length > 0 &&
                          (isExpanded ? (
                            <ChevronUp size={15} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={15} aria-hidden="true" />
                          ))}
                      </button>

                      {isExpanded && projectTasks.length > 0 && (
                        <ul className="project-tasks-list">
                          {projectTasks.map((t) => (
                            <li key={t.id} className={`project-task-item ${t.done ? 'is-done' : ''}`}>
                              <label className="task-checkbox">
                                <input
                                  type="checkbox"
                                  checked={t.done}
                                  disabled={blocked}
                                  onChange={() => toggleTaskDone(t)}
                                  aria-label={`Concluir tarefa: ${t.title}`}
                                />
                                <span className="check-visual">
                                  <Check size={13} aria-hidden="true" />
                                </span>
                              </label>
                              <span className="task-name">{t.title}</span>
                              <button
                                type="button"
                                className="unlink-btn"
                                disabled={blocked}
                                title="Desvincular deste projeto"
                                aria-label={`Desvincular tarefa: ${t.title}`}
                                onClick={() => unlinkTask(t)}
                              >
                                Desvincular
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="card-actions-bar">
                      {project.status === 'active' && (
                        <>
                          <button
                            type="button"
                            className="status-btn"
                            disabled={blocked}
                            onClick={() => updateProjectStatus(project, 'paused')}
                            title="Pausar projeto"
                          >
                            <Pause size={14} aria-hidden="true" /> Pausar
                          </button>
                          <button
                            type="button"
                            className="status-btn finish"
                            disabled={blocked}
                            onClick={() => updateProjectStatus(project, 'completed')}
                            title="Concluir projeto"
                          >
                            <CheckCircle2 size={14} aria-hidden="true" /> Concluir
                          </button>
                          <button
                            type="button"
                            className="status-btn danger"
                            disabled={blocked}
                            onClick={() => updateProjectStatus(project, 'archived')}
                            title="Arquivar projeto"
                          >
                            <Archive size={14} aria-hidden="true" /> Arquivar
                          </button>
                        </>
                      )}
                      {project.status === 'paused' && (
                        <>
                          <button
                            type="button"
                            className="status-btn"
                            disabled={blocked}
                            onClick={() => updateProjectStatus(project, 'active')}
                            title="Reabrir projeto"
                          >
                            <Play size={14} aria-hidden="true" /> Reabrir
                          </button>
                          <button
                            type="button"
                            className="status-btn finish"
                            disabled={blocked}
                            onClick={() => updateProjectStatus(project, 'completed')}
                            title="Concluir projeto"
                          >
                            <CheckCircle2 size={14} aria-hidden="true" /> Concluir
                          </button>
                          <button
                            type="button"
                            className="status-btn danger"
                            disabled={blocked}
                            onClick={() => updateProjectStatus(project, 'archived')}
                            title="Arquivar projeto"
                          >
                            <Archive size={14} aria-hidden="true" /> Arquivar
                          </button>
                        </>
                      )}
                      {project.status === 'completed' && (
                        <>
                          <button
                            type="button"
                            className="status-btn"
                            disabled={blocked}
                            onClick={() => updateProjectStatus(project, 'active')}
                            title="Reabrir projeto"
                          >
                            <RotateCcw size={14} aria-hidden="true" /> Reabrir
                          </button>
                          <button
                            type="button"
                            className="status-btn danger"
                            disabled={blocked}
                            onClick={() => updateProjectStatus(project, 'archived')}
                            title="Arquivar projeto"
                          >
                            <Archive size={14} aria-hidden="true" /> Arquivar
                          </button>
                        </>
                      )}
                      {project.status === 'archived' && (
                        <button
                          type="button"
                          className="status-btn"
                          disabled={blocked}
                          onClick={() => updateProjectStatus(project, 'active')}
                          title="Restaurar projeto para ativo"
                        >
                          <RotateCcw size={14} aria-hidden="true" /> Restaurar projeto
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Goal Form Modal */}
      {goalModalOpen && (
        <GoalModal
          data={data}
          goal={editingGoal}
          blocked={blocked}
          onClose={() => setGoalModalOpen(false)}
          onSave={(savedGoal) => {
            const currentList = data.goals ?? [];
            if (currentList.length >= 200 && !editingGoal) {
              return { success: false, error: 'Limite de 200 metas atingido.' };
            }
            const updated = update((prev) => {
              const list = prev.goals ?? [];
              const nextList = editingGoal
                ? list.map((g) => (g.id === savedGoal.id ? savedGoal : g))
                : [...list, savedGoal];
              return { ...prev, goals: nextList };
            });
            if (updated) {
              setGoalModalOpen(false);
              showNotice(editingGoal ? 'Meta atualizada.' : 'Meta criada com sucesso.');
              return { success: true };
            }
            return { success: false, error: 'Não foi possível salvar. Verifique os dados.' };
          }}
        />
      )}

      {/* Project Form Modal */}
      {projectModalOpen && (
        <ProjectModal
          data={data}
          project={editingProject}
          blocked={blocked}
          onClose={() => setProjectModalOpen(false)}
          onSave={(savedProject) => {
            const currentList = data.projects ?? [];
            if (currentList.length >= 500 && !editingProject) {
              return { success: false, error: 'Limite de 500 projetos atingido.' };
            }
            const updated = update((prev) => {
              const list = prev.projects ?? [];
              const nextList = editingProject
                ? list.map((p) => (p.id === savedProject.id ? savedProject : p))
                : [...list, savedProject];
              return { ...prev, projects: nextList };
            });
            if (updated) {
              setProjectModalOpen(false);
              showNotice(editingProject ? 'Projeto atualizado.' : 'Projeto criado com sucesso.');
              return { success: true };
            }
            return { success: false, error: 'Não foi possível salvar. Verifique os dados.' };
          }}
        />
      )}
    </section>
  );
}

// ----------------------------------------------------------------------------
// Goal Modal Component
// ----------------------------------------------------------------------------
function GoalModal({
  data,
  goal,
  blocked,
  onClose,
  onSave,
}: {
  data: Workspace;
  goal: Goal | null;
  blocked: boolean;
  onClose: () => void;
  onSave: (goal: Goal) => { success: boolean; error?: string };
}) {
  const [title, setTitle] = useState(goal?.title ?? '');
  const [description, setDescription] = useState(goal?.description ?? '');
  const [areaId, setAreaId] = useState(goal?.areaId ?? '');
  const [deadline, setDeadline] = useState(goal?.deadline ?? '');
  const [status, setStatus] = useState<Goal['status']>(goal?.status ?? 'active');

  const [hasMetric, setHasMetric] = useState(!!goal?.metric);
  const [unit, setUnit] = useState(goal?.metric?.unit ?? '');
  const [baseline, setBaseline] = useState(goal?.metric?.baseline?.toString() ?? '0');
  const [target, setTarget] = useState(goal?.metric?.target?.toString() ?? '10');
  const [current, setCurrent] = useState(goal?.metric?.current?.toString() ?? '0');

  const [formError, setFormError] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError('Informe um título para a meta.');
      return;
    }

    let metricObj: Goal['metric'] | undefined = undefined;
    if (hasMetric) {
      const cleanUnit = unit.trim();
      if (!cleanUnit) {
        setFormError('Informe a unidade de medida (ex: livros, kg, km).');
        return;
      }
      const bNum = Number(baseline);
      const tNum = Number(target);
      const cNum = Number(current);
      if (!Number.isFinite(bNum) || !Number.isFinite(tNum) || !Number.isFinite(cNum)) {
        setFormError('Os valores da medição devem ser números válidos.');
        return;
      }
      if (bNum === tNum) {
        setFormError('O valor alvo deve ser diferente do ponto inicial.');
        return;
      }
      metricObj = {
        unit: cleanUnit,
        baseline: bNum,
        target: tNum,
        current: cNum,
      };
    }

    const payload: Goal = {
      id: goal?.id ?? crypto.randomUUID(),
      title: cleanTitle,
      status,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(areaId ? { areaId } : {}),
      ...(deadline ? { deadline } : {}),
      ...(metricObj ? { metric: metricObj } : {}),
    };

    // Require confirmation when transitioning to archived via form
    if (status === 'archived' && goal?.status !== 'archived') {
      const confirmed = window.confirm(
        'Arquivar esta meta? Seus projetos e tarefas vinculados serão preservados.',
      );
      if (!confirmed) return;
    }

    const res = onSave(payload);
    if (!res.success && res.error) {
      setFormError(res.error);
    }
  }

  return (
    <Modal title={goal ? 'Editar meta' : 'Nova meta'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="entry-form planning-modal-form">
        {formError && (
          <div className="error-banner form-error-banner" role="alert">
            {formError}
          </div>
        )}

        <label htmlFor="goal-title">Título da meta</label>
        <input
          id="goal-title"
          name="title"
          required
          autoFocus
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Ler 12 livros este ano"
        />

        <label htmlFor="goal-description">Descrição · opcional</label>
        <textarea
          id="goal-description"
          name="description"
          maxLength={2000}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Por que esta meta é importante e qual é o seu sentido?"
        />

        <div className="form-grid">
          <div>
            <label htmlFor="goal-area">Área da vida · opcional</label>
            <AreaSelect id="goal-area" data={data} value={areaId} onChange={setAreaId} />
          </div>
          <div>
            <label htmlFor="goal-deadline">Prazo · opcional</label>
            <input
              id="goal-deadline"
              name="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>

        <label htmlFor="goal-status">Status</label>
        <select
          id="goal-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Goal['status'])}
        >
          <option value="active">Ativa</option>
          <option value="paused">Pausada</option>
          <option value="completed">Concluída</option>
          <option value="archived">Arquivada</option>
        </select>

        {/* Quantitative metric section */}
        <fieldset className="metric-fieldset">
          <legend>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={hasMetric}
                onChange={(e) => setHasMetric(e.target.checked)}
              />
              <span>Adicionar medição quantitativa da meta</span>
            </label>
          </legend>

          {hasMetric && (
            <div className="metric-inputs-grid">
              <div className="full-width">
                <label htmlFor="metric-unit">Unidade de medida</label>
                <input
                  id="metric-unit"
                  maxLength={40}
                  required={hasMetric}
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="Ex.: livros, kg, km, horas"
                />
              </div>
              <div>
                <label htmlFor="metric-baseline">Ponto inicial</label>
                <input
                  id="metric-baseline"
                  type="number"
                  step="any"
                  required={hasMetric}
                  value={baseline}
                  onChange={(e) => setBaseline(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="metric-current">Valor atual</label>
                <input
                  id="metric-current"
                  type="number"
                  step="any"
                  required={hasMetric}
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="metric-target">Valor alvo</label>
                <input
                  id="metric-target"
                  type="number"
                  step="any"
                  required={hasMetric}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
              </div>
            </div>
          )}
        </fieldset>

        <div className="form-footer">
          <button type="button" className="button outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={blocked}>
            Salvar meta <Check size={17} aria-hidden="true" />
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ----------------------------------------------------------------------------
// Project Modal Component
// ----------------------------------------------------------------------------
function ProjectModal({
  data,
  project,
  blocked,
  onClose,
  onSave,
}: {
  data: Workspace;
  project: Project | null;
  blocked: boolean;
  onClose: () => void;
  onSave: (project: Project) => { success: boolean; error?: string };
}) {
  const [title, setTitle] = useState(project?.title ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [areaId, setAreaId] = useState(project?.areaId ?? '');
  const [goalId, setGoalId] = useState(project?.goalId ?? '');
  const [deadline, setDeadline] = useState(project?.deadline ?? '');
  const [status, setStatus] = useState<Project['status']>(project?.status ?? 'active');

  const [formError, setFormError] = useState('');

  // Available goals: filter out archived unless it is the currently linked goal
  const availableGoals = (data.goals ?? []).filter(
    (g) => g.status !== 'archived' || g.id === project?.goalId,
  );

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError('');

    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setFormError('Informe um título para o projeto.');
      return;
    }

    const payload: Project = {
      id: project?.id ?? crypto.randomUUID(),
      title: cleanTitle,
      status,
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(areaId ? { areaId } : {}),
      ...(goalId ? { goalId } : {}),
      ...(deadline ? { deadline } : {}),
    };

    // Require confirmation when transitioning to archived via form
    if (status === 'archived' && project?.status !== 'archived') {
      const confirmed = window.confirm(
        'Arquivar este projeto? Suas tarefas e anotações vinculadas serão preservadas.',
      );
      if (!confirmed) return;
    }

    const res = onSave(payload);
    if (!res.success && res.error) {
      setFormError(res.error);
    }
  }

  return (
    <Modal title={project ? 'Editar projeto' : 'Novo projeto'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="entry-form planning-modal-form">
        {formError && (
          <div className="error-banner form-error-banner" role="alert">
            {formError}
          </div>
        )}

        <label htmlFor="project-title">Título do projeto</label>
        <input
          id="project-title"
          name="title"
          required
          autoFocus
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex.: Reformar escritório de estudos"
        />

        <label htmlFor="project-description">Descrição · opcional</label>
        <textarea
          id="project-description"
          name="description"
          maxLength={2000}
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Qual é o escopo e o resultado esperado deste projeto?"
        />

        <label htmlFor="project-goal">Meta vinculada · opcional</label>
        <select
          id="project-goal"
          name="goalId"
          value={goalId}
          onChange={(e) => setGoalId(e.target.value)}
        >
          <option value="">Sem meta vinculada</option>
          {availableGoals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
              {g.status === 'archived' ? ' (arquivada)' : ''}
            </option>
          ))}
        </select>

        <div className="form-grid">
          <div>
            <label htmlFor="project-area">Área da vida · opcional</label>
            <AreaSelect id="project-area" data={data} value={areaId} onChange={setAreaId} />
          </div>
          <div>
            <label htmlFor="project-deadline">Prazo · opcional</label>
            <input
              id="project-deadline"
              name="deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>
        </div>

        <label htmlFor="project-status">Status</label>
        <select
          id="project-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as Project['status'])}
        >
          <option value="active">Ativo</option>
          <option value="paused">Pausado</option>
          <option value="completed">Concluído</option>
          <option value="archived">Arquivado</option>
        </select>

        <div className="form-footer">
          <button type="button" className="button outline" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={blocked}>
            Salvar projeto <Check size={17} aria-hidden="true" />
          </button>
        </div>
      </form>
    </Modal>
  );
}
