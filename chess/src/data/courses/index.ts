import type { CourseDef } from '../../lib/courses'
import { albin } from './albin'
import { alekhine } from './alekhine'
import { dragon } from './dragon'
import { dutch } from './dutch'
import { grunfeld } from './grunfeld'
import { kingsIndian } from './kingsIndian'
import { najdorf } from './najdorf'
import { nimzo } from './nimzo'
import { petrov } from './petrov'
import { philidor } from './philidor'
import { pirc } from './pirc'
import { qgdBlack } from './qgdBlack'
import { slavBlack } from './slavBlack'
import { accelDragon } from './accelDragon'
import { falkbeer } from './falkbeer'
import { french } from './french'
import { goring } from './goring'
import { ruyLopez } from './ruyLopez'
import { scandinavian } from './scandinavian'
import { scotch } from './scotch'
import { staunton } from './staunton'
import { trapsBlack } from './trapsBlack'
import { trapsWhite } from './trapsWhite'
import { traxler } from './traxler'
import { vienna } from './vienna'
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
  scotch,
  ruyLopez,
  vienna,
  goring,
  staunton,
  trapsWhite,
  // За чёрных: защиты против 1.e4
  caroKann,
  scandinavian,
  french,
  najdorf,
  dragon,
  accelDragon,
  alekhine,
  pirc,
  petrov,
  philidor,
  // За чёрных: защиты против 1.d4
  kingsIndian,
  grunfeld,
  nimzo,
  qgdBlack,
  slavBlack,
  dutch,
  // За чёрных: гамбиты
  stafford,
  from,
  budapest,
  albin,
  volga,
  schliemann,
  marshall,
  traxler,
  falkbeer,
  trapsBlack,
]
