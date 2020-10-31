import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireObject } from 'angularfire2/database';
import { Observable, of } from 'rxjs';
import { first, switchMap, tap } from 'rxjs/operators';
import { Game, GameCodeEntry } from '../fishbowl/types';
import { Helpful } from './app.helpers';

@Injectable({
  providedIn: 'root'
})
export class GameCodeService {

  constructor(
    private db: AngularFireDatabase,
  ) { }

  public async getCode(limit=3):Promise<string>{
    if (limit<=0) {
      console.error("ERROR: unique gameCode not found");
      return null;
    }
    let range = ['C','D','E','F','G','H','I','J','K','L','N','O','Q','R','U','W','X','Y','Z'];
    let code = Helpful.shuffle(range, 4).join('').toLowerCase();
    // NOTE: using ONLY lowercase 
    let found = await this.db.object<GameCodeEntry>(`/gameCodes/${code}`).valueChanges().pipe( first() ).toPromise();
    if (!found) return code;
    return this.getCode(limit-1)
  }

  public getGame$(code:string):Observable<Game> {
    return this.db.object<GameCodeEntry>(`/gameCodes/${code}`).valueChanges()
    .pipe(
      first(),
      switchMap( o=>{
        if (!o) return of(null);
        return this.db.object<Game>(`/games/${o.gameId}`).valueChanges().pipe( 
          first(),
          tap( g=>{
            if (!!g) g['uid'] = o.gameId;
          }),
        )
      }),
    )
  }
  /**
   * NOTE: does not verify that gameId is valid
   * @param gameId 
   * @param code 
   */
  public async setGameCode(gameId: string, code:string=null):Promise<void> {
    code = code || await this.getCode();
    return this.db.object<GameCodeEntry>(`/gameCodes/${code}`).update( {gameId, created:Date.now()} );
  }

}
