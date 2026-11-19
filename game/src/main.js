import './style.css';
import {Game} from './game.js';
import {escape} from './ui.js';
const game=new Game();game.init().catch(error=>{console.error(error);document.querySelector('#app').innerHTML=`<div class="blocked"><h1>Не удалось подготовить игру</h1><p>${escape(error.message)}</p><button class="primary" onclick="location.reload()">Попробовать снова</button></div>`;});
