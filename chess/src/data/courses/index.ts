import type { CourseDef } from '../../lib/courses'
import { albin } from './albin'
import { blackmarDiemer } from './blackmarDiemer'
import { budapest } from './budapest'
import { caroKann } from './caroKann'
import { danish } from './danish'
import { evans } from './evans'
import { from } from './from'
import { italian } from './italian'
import { kingsGambit } from './kingsGambit'
import { london } from './london'
import { marshall } from './marshall'
import { queensGambit } from './queensGambit'
import { schliemann } from './schliemann'
import { scotchGambit } from './scotchGambit'
import { smithMorra } from './smithMorra'
import { stafford } from './stafford'
import { twoKnights } from './twoKnights'
import { volga } from './volga'

/** Встроенная база дебютов и гамбитов. Порядок — как в библиотеке. */
export const BUILT_IN_COURSES: CourseDef[] = [
  // За белых
  italian,
  london,
  queensGambit,
  evans,
  twoKnights,
  scotchGambit,
  danish,
  kingsGambit,
  smithMorra,
  blackmarDiemer,
  // За чёрных
  caroKann,
  stafford,
  from,
  budapest,
  albin,
  volga,
  schliemann,
  marshall,
]
