import { useMemo } from 'react'
import { compileCourse, type Course } from '../lib/courses'
import { useStore } from '../lib/storage'
import { repertoireStore } from '../store'
import { BUILT_IN_COURSES } from './courses'

const BUILT_IN: Course[] = BUILT_IN_COURSES.map(compileCourse)

/** Все курсы: встроенная база + пользовательский репертуар. */
export function useCourses(): Course[] {
  const custom = useStore(repertoireStore)
  return useMemo(() => [...BUILT_IN, ...custom.map((c) => compileCourse({ ...c, custom: true }))], [custom])
}

export function useCourse(id: string | undefined): Course | undefined {
  const courses = useCourses()
  return courses.find((c) => c.id === id)
}
