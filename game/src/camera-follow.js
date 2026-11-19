import {progress} from './map.js';

const validPosition=cube=>Number.isFinite(cube?.body?.position?.x)&&Number.isFinite(cube?.body?.position?.y);
const TIE_EPSILON=1e-7;

// Camera choice reads the actual race. It never changes the prediction, race
// order, participant state or simulation clock.
export function chooseFollowTarget(race,mode,previousId=null){
  if(!race||!['selected','leader'].includes(mode)||!Array.isArray(race.cubes))return null;
  if(mode==='selected')return race.cubes.find(cube=>cube.id===race.prediction?.selected&&(cube.alive||(race.finished&&cube.id===race.winner))&&validPosition(cube))||null;
  if(race.finished)return race.cubes.find(cube=>cube.id===race.winner&&validPosition(cube))||null;
  if(!race.map?.rooms?.length)return null;
  const candidates=[];let maximum=-Infinity;
  for(const cube of race.cubes){
    if(!cube.alive||!validPosition(cube))continue;
    const value=progress(race.map,cube.body.position);if(!Number.isFinite(value))continue;
    candidates.push({cube,value});maximum=Math.max(maximum,value);
  }
  const leaders=candidates.filter(candidate=>maximum-candidate.value<=TIE_EPSILON);
  const previous=leaders.find(candidate=>candidate.cube.id===previousId);if(previous)return previous.cube;
  return leaders.reduce((best,candidate)=>!best||candidate.cube.id<best.id?candidate.cube:best,null);
}
