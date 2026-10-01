import type { Subject, Workspace } from '@/lib/workspace';

// Options for any subject <select>, grouped by course; active courses first.
export function SubjectOptions({ data, label = (subject) => subject.name }: { data: Workspace; label?: (subject: Subject) => string }) {
  const option = (subject: Subject) => <option key={subject.id} value={subject.id}>{label(subject)}</option>;
  const courses = [...(data.courses ?? [])].sort((a, b) => Number(a.status !== 'active') - Number(b.status !== 'active'));
  const known = new Set(courses.map((course) => course.id));
  return <>
    {courses.map((course) => {
      const items = data.subjects.filter((subject) => subject.courseId === course.id);
      return items.length > 0 && <optgroup key={course.id} label={course.name}>{items.map(option)}</optgroup>;
    })}
    {data.subjects.filter((subject) => !subject.courseId || !known.has(subject.courseId)).map(option)}
  </>;
}
