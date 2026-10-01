'use client';
import { useState } from 'react';
import { colors, courseKinds, type Course, type CourseKind } from '@/lib/workspace';
import { capitalize, courseKindLabels, defaultUnits, unitPresets } from '@/lib/courses';

const colorNames = ['Verde', 'Lilás', 'Areia', 'Azul', 'Rosa'];
const statusOptions = [['active', 'Cursando'], ['paused', 'Pausado'], ['completed', 'Concluído']] as const;

export function ColorOptions({ legend, value }: { legend: string; value: Course['color'] }) {
  return <fieldset className="color-options"><legend>{legend}</legend>{colors.map((color, index) => <label key={color} className={color}><input type="radio" name="color" value={color} defaultChecked={value === color} />{colorNames[index]}</label>)}</fieldset>;
}

// "auto" keeps units undefined so the name follows the course type; presets are stored by index.
function unitsMode(units: Course['units']) {
  const preset = units ? unitPresets.findIndex((item) => item.singular === units.singular && item.plural === units.plural) : -1;
  return !units ? 'auto' : preset >= 0 ? String(preset) : 'custom';
}

export function CourseFields({ course, color }: { course?: Course; color: Course['color'] }) {
  const [kind, setKind] = useState<CourseKind>(course?.kind ?? 'graduacao');
  const [mode, setMode] = useState(unitsMode(course?.units));
  const [custom, setCustom] = useState(course?.units ?? { singular: '', plural: '' });
  const units = mode === 'auto' ? defaultUnits(kind) : mode === 'custom' ? custom : unitPresets[Number(mode)];
  return <>
    <label htmlFor="entry-course-kind">Tipo</label>
    <select id="entry-course-kind" name="courseKind" value={kind} onChange={(event) => setKind(event.target.value as CourseKind)}>{courseKinds.map((item) => <option key={item} value={item}>{courseKindLabels[item]}</option>)}</select>
    <label htmlFor="entry-institution">Instituição · opcional</label>
    <input id="entry-institution" name="institution" maxLength={160} defaultValue={course?.institution ?? ''} placeholder="Ex.: universidade, escola, plataforma" />
    <label htmlFor="entry-stage">Etapa atual · opcional</label>
    <input id="entry-stage" name="stage" maxLength={60} defaultValue={course?.stage ?? ''} placeholder="Ex.: 3º semestre, Módulo 2" />
    <ColorOptions legend="Cor do curso" value={course?.color ?? color} />
    <label htmlFor="entry-course-status">Situação</label>
    <select id="entry-course-status" name="status" defaultValue={course?.status ?? 'active'}>{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <label htmlFor="entry-units">Como chamar as partes do curso</label>
    <select id="entry-units" name="units" value={mode} onChange={(event) => setMode(event.target.value)} aria-describedby="entry-units-help">
      <option value="auto">Automático · {defaultUnits(kind).plural}</option>
      {unitPresets.map((item, index) => <option key={item.plural} value={index}>{capitalize(item.plural)}</option>)}
      <option value="custom">Personalizado</option>
    </select>
    {mode === 'custom' && <div className="form-grid">
      <div><label htmlFor="entry-unit-singular">No singular</label><input id="entry-unit-singular" name="unitSingular" required maxLength={30} value={custom.singular} onChange={(event) => setCustom({ ...custom, singular: event.target.value })} placeholder="Ex.: encontro" /></div>
      <div><label htmlFor="entry-unit-plural">No plural</label><input id="entry-unit-plural" name="unitPlural" required maxLength={30} value={custom.plural} onChange={(event) => setCustom({ ...custom, plural: event.target.value })} placeholder="Ex.: encontros" /></div>
    </div>}
    <p id="entry-units-help" className="form-hint">Vai aparecer como “Adicionar {units.singular.trim() || '…'}” e “2 {units.plural.trim() || '…'}”.</p>
  </>;
}
