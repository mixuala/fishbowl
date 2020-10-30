import { SnapshotAction, AngularFireObject } from 'angularfire2/database';
import { pipe, Observable, } from 'rxjs';
import { map, tap, withLatestFrom, } from 'rxjs/operators';
import * as dayjs from 'dayjs';

import { Helpful} from '../services/app.helpers';
import { 
  Game, GamePlayRound, RoundEnum,
  PlayerListByUids, TeamRosters,
  SpotlightPlayer, 
  GamePlayState,
  GamePlayLogEntries,
  PlayerByUids,
  GameDict,
  WordResult
} from './types';
import { Player } from '../user/role';

const WORDS_PER_QUICK_PLAYER = 3;


export class FishbowlHelpers {

  static
  isGameOver( g:Game) {
    return !!g.complete;
  }

  /**
   * usage: moderator can manually toggle a game active BEFORE isGametime()
   * - 'opens the door" from the Players Lounge early
   * @param g 
   */
  static
  isActive( g:Game) {
    return !g.complete && (g.activeGame || FishbowlHelpers.isGametime(g));
  }

  /**
   * usage: UX conditions only. based on game.gameTime only.
   * - listPage: CTA copy 
   * - gamePage: disable moderator activeGame toggle
   * - flash [live] badge
   * 
   * NOTE: use isActive() for most conditions, moderator can manually toggle true before isGametime()
   * @param g 
   */
  static
  isGametime( g:Game) {
    return !g.complete && g.gameTime < Date.now();
  }

  static
  isPlayersLoungeOpen( g:Game ) {
    if (FishbowlHelpers.isActive(g)) return true;
    if (FishbowlHelpers.isGameOver(g)) return false;
    const PLAYERS_LOUNGE_OPEN_TIME = 10*60*1000;
    let countdown = g.gameTime - Date.now();
    return countdown < PLAYERS_LOUNGE_OPEN_TIME;
  }

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

  /**
   * assign a new checkIn player to the smaller team
   * use for in-game, activeRound assignments
   * @param pid 
   * @param teams 
   */
  static
  assignPlayerToTeam( pid:string, teams:TeamRosters):TeamRosters {
    let doTeamAssignment = !Object.values(teams).find( playerIds=>playerIds.includes(pid));
    if (doTeamAssignment) {
      let playerCounts = Object.values(teams).map( playerIds=>playerIds.length);
      let smaller = Math.min(...playerCounts);
      let i = Object.values(teams).findIndex( playerIds=>playerIds.length==smaller );
      let newTeams:TeamRosters = Object.entries(teams).reduce( (o,[k,v])=>{
        o[k]=v.slice();
        if (v.length==smaller) {
          o[k].push(pid);
          smaller = -1;
        }
        return o;
      }, {})
      return newTeams;
    }
    return null;
  }

  static
  getCheckedInPlayers(game:Game):PlayerByUids {
    return Object.entries(game.checkIn).reduce( (o, [pid, v])=>{
      if (typeof v=='boolean' && v===false) {
        return o; // skip
      }
      o[pid] = game.players[pid];
      return o;
    },{});
  }

  static
  doPlayerEntryLookup(name:string=null, game:Game):[string, string] {
    let {players, checkIn} = game;
    // console.warn( "doPlayerEntryLookup()")
    if (game.activeRound){
      // confirm player has not checked in
      let pid = Object.keys(players).find( k=>players[k].toLowerCase()==name.trim().toLowerCase());
      if (pid && !!checkIn[pid]) {
        // return null;  
        // already checkedIn, show Toast
        if (!game['isDev']) {
          let msg = `Player \'${name}\' is already checked in on another device. Are you sure?`;
          let resp = window.confirm(msg)
          if (!resp) return;
        }
      }
    }
    let found = Object.entries(players).find( ([k,v])=>v.trim().toLowerCase()==name.toLowerCase());
    return !!found ? found : null;
  }

  static
  buildGamePlayRound(gameId: string, game:Game, type:RoundEnum, teams:TeamRosters=null, words:string[]=null): GamePlayRound{
    let teamNames = game.teamNames;
    if (!teamNames) teamNames = ['mahi mahi', 'yoko ono']
    let combined = Object.assign({}, game.players, game.checkIn)
    let checkedInPlayers = FishbowlHelpers.getCheckedInPlayers(game);
    teams = teams || FishbowlHelpers.assignTeams(checkedInPlayers, teamNames);

    if (Object.entries(checkedInPlayers).length<2) 
      throw new Error("Not Enough Players CheckedIn");

    let {quickPlay} = game;
    let entries:{[word:string]:boolean};
    if (words) {
      let playerCount = Object.keys(checkedInPlayers).length;
      words = Helpful.shuffle(words, playerCount*WORDS_PER_QUICK_PLAYER );
      entries = words.reduce( (o,w)=>(o[w]=true,o), {});
    }
    else {
      entries = Object.entries(game.entries).reduce( (o,[pid,_3words])=>{
        if (checkedInPlayers[pid]){
          _3words.forEach( w=>o[w]=true);
        }
        return o;
      } ,{});
    }

    return {
      uid: null,    // firebase pushId
      gameId,
      round: type,
      startTimeDesc: -Date.now(),
      teams,
      orderOfPlay: teamNames,
      entries,
      players: checkedInPlayers,
    }
  }

  static 
  getRoundIndex(gameDict:GameDict):{next:string, prev:string} {
    // find next round and make active
    let game = gameDict.game;
    if (!game.rounds) return null;
    let sortedRids = Object.entries(game.rounds).sort( (a,b)=>a[1]-b[1] ).map( v=>v[0]);
    let foundIndex = sortedRids.findIndex( rid=>{
      // find the next round that is not complete
      return gameDict[rid] && !(gameDict[rid] as GamePlayRound).complete;
    });
    if (!~foundIndex) return null;
    return { 
      next: sortedRids[foundIndex],
      prev: foundIndex==0 ? null : sortedRids[foundIndex-1]
    }
  }

  /**
   * adjust team rosters BEFORE gameHelpers.loadNextRound()
   * lifecycle:
   *  - beginNextGameRound() 
   *    => [HERE]
   *    => gameHelpers.loadNextRound()
   *    => gameHelpers.beginRound(rid);
   * 
   * @param gameDict 
   * @param reset 
   */
  static
  getLatestRoster(gameDict: GameDict):Partial<GamePlayRound> {
    let roundIndex = FishbowlHelpers.getRoundIndex(gameDict);
    if (!roundIndex) {
      let {complete, teams, players} = gameDict.game;
      if (complete && teams) {
        // gameOver, all rounds complete
        return {teams, players, orderOfPlay: gameDict.game.teamNames.slice() }
      }
      else return null;
    }
    // copy teams from prev round, if available
    let copyFrom = gameDict[roundIndex.prev || roundIndex.next] as GamePlayRound;
    return Helpful.pick( copyFrom, 'teams', 'players', 'orderOfPlay' );
  }

  static
  getPlayerSettings(pid:string, game:Game, round:GamePlayRound):{
    displayName:string, teamName?:string, teamId?:string
  } 
  {
    // get Player {displayName, teamName?, teamId? } from game
    // get Player.displayName from game.Players
    let stageName = game && game.players && game.players[pid];
    if (!stageName) return {} as any;

    
    let playerTeam = {displayName: stageName};
    // team assignment AFTER loadRounds() but BEFORE beginGameRound
    // be careful of state BETWEEN rounds
    if (round && round.teams) {
      // but team assignments happen in AFTER doCheckIn and loadRounds()
      Object.entries(round.teams).find( ([teamName, players])=>{
        if (players.find( uid=>uid==pid)) {
          let teamId = round.orderOfPlay.findIndex( v=>v==teamName)
          Object.assign(playerTeam, {teamId, teamName});
          return true;
        }
      });
    }
    return playerTeam
  }

  static 
  getSpotlightPlayer(gamePlay:GamePlayState, round:GamePlayRound):SpotlightPlayer{
    if (!round) return null;
    if (!gamePlay) return null;  // round is complete


    let {teams, players, orderOfPlay} = round;
    let {spotlight} = gamePlay;
    if (!spotlight || spotlight.teamIndex==-1) {
      // round has not yet begun
      // for gamePlay, call: GameHelpers.loadNextRound()
      return null;
    }

    if (!teams) {
      return null
    }
    
    let uid = teams[  orderOfPlay[spotlight.teamIndex] ][ spotlight.playerIndex[ spotlight.teamIndex ] ];
    if (!uid) {
      throw new Error( "can't find player after moving people around")
    }
    let label = players[ uid ];
    let found = Object.entries(teams).find( ([name, uids])=>{ return uids.find( v=>v==uid) });
    if (!found) {
      throw new Error(`cant find next player ${uid}, ${teams}`)
    }
    let teamName = found.length && found[0];
    return {uid, playerName: label, teamName, teamIndex:spotlight.teamIndex};
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
      // if [pass]=>available, unshift index onto remaining
      let [word, available] = Object.entries(lastResult)[0];
      // true: lastResult:word == Object.keys(round.entries)[remaining[0]]

      if (available) {
        let index = Object.keys(round.entries).findIndex( w=>w==word);
        if (~index) {
          remaining.push(index);
        }
      }
      // shift() the "lastResult" off the remaining stack.
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
    // return the next word off the remaining stack. lastResult has already been shifted()
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


  static BEGIN_ROUND_MARKER = "##begin-round##"
  static
  filter_BeginRoundMarker = (o={})=>{
    return Object.entries(o).filter( ([k,v]:[string, WordResult])=>v.word!=FishbowlHelpers.BEGIN_ROUND_MARKER ).reduce( (o,[k,v])=>(o[k]=v,o), {});
  }

  static
  DEV_patchMissingAttrs(o, type:string){
    switch(type) {
      case "game": {
        let g = o as Game;
        g.teamNames = g.teamNames || ['mahi mahi', 'yoko ono'];
        return g;
      }
    }
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
  pipeSortKeys(keys:string[], asc:boolean[]=[], compareAsBoolean:string[]=[]){
    return pipe(
      map( (arr:any[])=>{
        arr = arr.sort( (a,b)=>{
          let check = 0;
          keys.find( (key,i)=>{
            let order:number = (asc.length>i) ? (!!asc[i] ? 1 : -1) : (asc[asc.length-1] && 1);
            if (compareAsBoolean.includes(key)==false && (typeof a[key]=='boolean' || typeof b[key]=='boolean')) {
              compareAsBoolean.push(key)
            }
            if ( compareAsBoolean.includes(key) ) {
              check = order * (a[key] ? 1 : 0)-(b[key] ? 1 : 0)
            }
            else {
              check = order * a[key]-b[key];
            }
            if (check===0) return false;
            return true;
          })
          return check;
        });

        // console.log(arr.map( (o,i)=>Helpful.pick(o, 'complete', 'gameTime', 'label')));
        return arr;

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

  static
  pipeGameIsPublished(player$: Observable<Player>) {
    return pipe(
      withLatestFrom(player$),
      map( (res)=>{
        let games = res[0] as Game[];
        let p = res[1] as Player;
        return games.filter( g=>{
          if (g.public) return true;
          if (p && g.moderators[p.uid]==true) return true;
        })
      })
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