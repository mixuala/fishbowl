import { SnapshotAction, AngularFireObject } from 'angularfire2/database';
import { pipe, } from 'rxjs';
import { map, } from 'rxjs/operators';
import * as dayjs from 'dayjs';

import { 
  Game, GamePlayRound, RoundEnum,
  PlayerByUids, TeamRosters,
  SpotlightPlayer 
} from './types';
import { Helpful} from '../services/app.helpers';

export class FishbowlHelpers {

  static 
  setGameDateTime(day:number=5, hour:number=19):dayjs.Dayjs {
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
  assignTeams(game:Game, teamNames:string[]):TeamRosters {
    let shuffledPlayers = Helpful.shuffle(Object.keys(game.players));
    let teamCount = teamNames.length;

    let teams = teamNames.reduce( (o,v)=>(o[v]=[] as PlayerByUids, o), {} );
    shuffledPlayers.forEach( (uid,i)=>{
      let teamIndex = i % teamCount;
      teams[ teamNames[teamIndex] ].push(uid);
    });
    return teams;
  }

  static
  buildGamePlayRound(game:Game, type:RoundEnum): GamePlayRound{
    let teamNames = game.teamNames;
    if (!teamNames) teamNames = ['blue team', 'red team'];    // DEV
    let entries = Object.values(game.entries).reduce( (o,_3words)=>{
      _3words.forEach( w=>o[w]=true);
      return o;
    } ,{});
    let teams = FishbowlHelpers.assignTeams(game, teamNames);
    let spotlight = {
      teamIndex: -1,
      playerIndex: teamNames.map( _=>0),
    }
    let timer = {
      seconds:null
    }

    return {
      uid: null,    // firebase pushId
      gameId: game.uid,
      round: type,
      startTimeDesc: -Date.now(),
      teams,
      orderOfPlay: teamNames,
      entries,
      players: Object.assign({}, game.players),
      spotlight,
      timer
    }
  }

  static
  moveSpotlight(round:GamePlayRound, itemRef:AngularFireObject<GamePlayRound>){
    let spotlight = Object.assign( {} , round.spotlight );
    let teamRosters = Object.values(round.teams);
    let limits = {
      teamIndex: teamRosters.length,
      playerIndex: teamRosters.map( v=>v.length)
    }
    // increment team first
    spotlight.teamIndex +=1;
    
    if (spotlight.teamIndex >= limits.teamIndex){
      // after last team, 
      spotlight.teamIndex = 0;
      // increment player on each time
      spotlight.playerIndex = spotlight.playerIndex.map( (v,i)=>{
        v +=1;
        return v >= limits.playerIndex[i] ? 0 : v;
      });
    }
    itemRef.update({spotlight});
  }

  static 
  getSpotlightPlayer(round:GamePlayRound){
    let {spotlight, teams, players} = round;
    if (!spotlight) 
      return null;
    let uid = Object.values(teams)[ spotlight.teamIndex ][ spotlight.playerIndex[ spotlight.teamIndex ] ];
    let label = players[ uid ];
    return {uid, label};
  }

  static
  pipeSnapshot2Data() {
    return pipe( 
      map( (sa:SnapshotAction<any>[])=>sa.map( o=>{
        let value = o.payload.val();
        value.uid = o.key;
        return value;
      }))
    )
  }
  
}