import { SnapshotAction, AngularFireObject } from 'angularfire2/database';
import { pipe, Observable, } from 'rxjs';
import { map, tap, } from 'rxjs/operators';
import * as dayjs from 'dayjs';

import { 
  Game, GamePlayRound, RoundEnum,
  PlayerListByUids, TeamRosters,
  SpotlightPlayer, 
  GamePlayState,
  GamePlayLogEntries,
  PlayerByUids
} from './types';
import { Helpful} from '../services/app.helpers';

export class FishbowlHelpers {

  static 
  setGameDateTime(day:number=5, hour:number=19):dayjs.Dayjs {
    let min = dayjs().day();
    day = day<min ? day+7 : day;
    let datetime = {
      day, // Fri=5
      hour,
      startOf: 'hour'
    }
    let startTime = Object.entries(datetime).reduce( (d, [k,v])=>{
      if (k=='startOf') return d.startOf(v as dayjs.UnitType)
      return d.set(k as dayjs.UnitType, v as number);
    }, dayjs() );
    console.log("Set gameDateTime=", startTime);
    return startTime;
  }

  static
  assignTeams(players:PlayerByUids, teamNames:string[]):TeamRosters {
    let shuffledPlayerUids = Helpful.shuffle(Object.keys(players));
    let teamCount = teamNames.length;

    let teams = teamNames.reduce( (o,v)=>(o[v]=[] as PlayerListByUids, o), {} );
    shuffledPlayerUids.forEach( (uid,i)=>{
      let teamIndex = i % teamCount;
      teams[ teamNames[teamIndex] ].push(uid);
    });
    return teams;
  }

  static
  buildGamePlayRound(game:Game, type:RoundEnum): GamePlayRound{
    let teamNames = game.teamNames;
    if (!teamNames) teamNames = ['blue team', 'red team'];    // DEV
    let combined = Object.assign({}, game.players, game.checkIn)
    let checkedInPlayers:PlayerByUids = Object.entries(combined).reduce( (o, [pid, v])=>{
      if (typeof v=='boolean' && v===false) 
        return o;

      o[pid] = game.players[pid];
      return o;
    },{});
    let entries = Object.entries(game.entries).reduce( (o,[pid,_3words])=>{
      if (checkedInPlayers[pid]){
        _3words.forEach( w=>o[w]=true);
      }
      return o;
    } ,{});
    let teams = FishbowlHelpers.assignTeams(checkedInPlayers, teamNames);


    return {
      uid: null,    // firebase pushId
      gameId: game.uid,
      round: type,
      startTimeDesc: -Date.now(),
      teams,
      orderOfPlay: teamNames,
      entries,
      players: checkedInPlayers,
    }
  }

  static
  getPlayerSettings(pid:string, game:Game, round:GamePlayRound):{
    displayName:string, teamName?:string, teamId?:string
  } 
  {
    // get Player {displayName, teamName?, teamId? } from game
    // get Player.displayName from game.Players
    let displayName = game.players && game.players[pid];
    if (!displayName) return {} as any;

    
    let playerTeam = {displayName};
    // team assignment AFTER loadRounds() but BEFORE beginGameRound
    // be careful of state BETWEEN rounds
    if (round && round.teams) {
      // but team assignments happen in AFTER doCheckIn and loadRounds()
      Object.entries(round.teams).find( ([teamName, players], i)=>{
        if (players.find( uid=>uid==pid)) {
          Object.assign(playerTeam, {teamId: i, teamName});
          return true;
        }
      });
    }
    return playerTeam
  }

  static 
  getSpotlightPlayer(gamePlay:GamePlayState, round:GamePlayRound):any{
    if (!round) return {};
    if (!gamePlay) return {};  // round is complete


    let {teams, players} = round;
    let {spotlight} = gamePlay;
    if (spotlight.teamIndex==-1) {
      // round has not yet begun
      // for gamePlay, call: GameHelpers.loadNextRound()
      return {};
    }

    let uid = Object.values(teams)[ spotlight.teamIndex ][ spotlight.playerIndex[ spotlight.teamIndex ] ];
    let label = players[ uid ];
    let [teamName, found] = Object.entries(round.teams).find( ([name, uids])=>uids.find( v=>v==uid) );
    return {uid, label, teamName};
  }



  /**
   * link clue streaming to the timer, wait for the timer to start
   * pipe(
   *  filter( ()=>!!timerState),
   *  takeUntil( timerComplete$ )
   *  
   * )
   */
  static 
  preparePlayerRound$( timerState:boolean, timerComplete$:Observable<void>) {

  }

  /**
   * updateFishbowl with gamePlay+gameLog results, then pick a word from a shuffled list
   * - shuffle words ONCE per playerRound, repeat words in the same sequence
   * - Note: lastResult is pre-update, not be in the cloud, so the gamePlay update can happen in one transaction
   * - TODO: push lastResult to gameLog BEFORE playerRoundComplete
   * 
   * @param round 
   * @param gamePlay 
   * @param lastResult { [word]: available }
   */ 
  static
  nextWord(round:GamePlayRound, gamePlay:GamePlayState, lastResult: {[word:string]: boolean}=null): {
      word: string,
      remaining: number[],      // array of index values from Object.keys(round.entries)
    } 
  { 
    let remaining = gamePlay.remaining
    let doShuffle = lastResult===null;
    if (lastResult){
      // if wrong, unshift index onto remaining
      let [word, available] = Object.entries(lastResult)[0];
      if (available) {
        let index = Object.keys(round.entries).findIndex( w=>w==word);
        if (~index) {
          remaining.push(index);
        }
      }
      remaining.shift();
    }
    else {
      lastResult = {};
      // last PASS/AVAILABLE result from previous round is missing from next round?
    }

    if (doShuffle) {
      let fishbowl = FishbowlHelpers.updateFishbowl(round, gamePlay.log, lastResult);
      let remainingWords = Object.entries(fishbowl).filter( ([word,avail])=>avail===true ).map( ([word,avail])=>word );
      let availableByIndex = remainingWords.map( (w,i)=>Object.keys(round.entries).findIndex( v=>v==w) ).filter( v=>v>-1);
      remaining = Helpful.shuffle(availableByIndex);
    }
    if (remaining.length==0) {
      return {word:null, remaining:[]}
    }
    let word = Object.keys(round.entries)[remaining[0]]
    return {word, remaining};
  }
  
  /**
   * merges gamePlay.log with round.entries and optionally last word result;
   * @param gamePlay 
   * @param round 
   * @param lastResult { [word]: available }
   */
  static
  updateFishbowl(round:GamePlayRound, logEntries:GamePlayLogEntries={}, lastResult: {[word:string]:boolean}={}): {[word:string]: boolean} {

    // let path = `/round/${rid}/entries`
    let playerBowl = Object.values(logEntries).reduce( (res, o)=>{
      // logEntries are historical and the same word can repeat until result=true
      // once its false, always false. 
      if (res[o.word]===false) return res;

      let avail = !o.result;  // a correct guess means the word is out of the fishbowl
      res[o.word] = avail;     
      return res;
    }, {});

    let fishbowl = Object.assign( {}, round.entries, playerBowl, lastResult);
    // console.log(">>> updateFishbowl=",fishbowl);
    // console.log("   >>> fishbowl false=", Object.values(fishbowl).filter(v=>v==false).length)
    // console.log("   >>> round.entries false=", Object.values(round.entries).filter(v=>v==false).length)
    return fishbowl as {[word:string]: boolean};
  }

  static
  getRemaining (gamePlay:GamePlayState):string {
    let count = gamePlay && gamePlay.remaining && gamePlay.remaining.length;
    return count ? count.toString() : "––";
  }


  static 
  pipeSort(key:string, asc=true){
    let order = !!asc ? 1 : -1;
    return pipe(
      map( (arr:any[])=>{
        arr.sort( (a,b)=>order * a[key]-b[key] )
        return arr
      })
    )
    
  }

  static
  pipeSnapshot2Data() {
    return pipe( 
      map( (sa:SnapshotAction<any>|Array<SnapshotAction<any>>)=>{
        let items = sa instanceof Array ? sa : [sa];
        let res = items.map( o=>{
          let value = o.payload.val();
          value.uid = o.key;
          return value;
        });
        return sa instanceof Array ? res : res.pop();
      }),
    )
  }

  // static
  // pipeStyleTimerFromRound(target:HTMLElement) {
  //   let state:string;
  //   return pipe(
  //     tap((round:GamePlayRound)=>{
  //       if (!round.timer && state!="reset") {
  //         state = "reset";
  //         target && target.classList.remove('ticking', 'paused');
  //       }
  //       else if (round.timer.pause && state!="pause"){
  //         state = "pause";
  //         target && target.classList.add('ticking', 'paused');
  //       }
  //       else if (state!="ticking") {
  //         state = "ticking";
  //         target && target.classList.add('ticking');
  //       }
  //     })
  //   )
  // }
  
}