import { Component, OnInit, Input, SimpleChange } from '@angular/core';
import { Observable } from 'rxjs';
import { GameDict } from '../../types';

@Component({
  selector: 'app-game-over',
  templateUrl: './game-over.component.html',
  styleUrls: ['./game-over.component.scss'],
})
export class GameOverComponent implements OnInit {

  public winnersByRound: any;

  @Input('game-summary') gameSummary: {scoreboard:any, teamNames:[string,string]}

  @Input() gameDict$:Observable<GameDict>;
  
  constructor() { }

  ngOnInit() {}

  ngOnChanges(o) {
    Object.entries(o).forEach( (en:[string,SimpleChange])=>{
      let [k, change] = en;
      switch(k){
        case 'gameSummary': {
          let{ scoreboard, teamNames} = this.gameSummary;
          this.winnersByRound = Object.keys(scoreboard).reduce( (o, round)=>{ 
            let team0 = scoreboard[round][teamNames[0]] || {};
            let team1 = scoreboard[round][teamNames[1]] || {};
            o[round]==null;
            if ((team0.points || 0) > (team1.points  || 0)) o[round]=teamNames[0];
            if ((team1.points || 0) > (team0.points  || 0)) o[round]=teamNames[1];
            return o;
          }, {});
        }
      }
    });
  }


}
