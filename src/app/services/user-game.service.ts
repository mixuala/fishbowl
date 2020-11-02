import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
// import * as dayjs from 'dayjs';
import { merge, combineLatest, Observable, BehaviorSubject, Subscription } from 'rxjs';
import { concatAll, concatMap, first, mergeMap, take, map, tap, throttleTime, debounceTime } from 'rxjs/operators';
import { Game, UserGameEntry, UserGames } from '../fishbowl/types';
import { Helpful } from './app.helpers';

@Injectable({
  providedIn: 'root'
})
export class UserGameService {

  private _userGames$ = new BehaviorSubject<UserGames>({});
  private _subscriptions:{uid?:string, sub?:Subscription} = {};

  constructor(
    private db: AngularFireDatabase,
  ) { 
  }

  /**
   * validate and update UserGames against /games, 
   * - handle case when game is deleted or gameTime changes
   * - use throttleTime
   */
  public validateGames() {
    const userGames = this._userGames$.getValue();
    const gids = Object.keys(userGames);
    // console.log("2: validateGames$, gids=", gids);
    const games$ = gids.map( gid=>{
      return this.db.object<Game>(`/games/${gid}`).valueChanges().pipe( 
        first(),
      )
    });
    combineLatest( games$ ).pipe( 
      first(),
      map( games=>{
        let validated = gids.reduce( (o,k,i)=>{
          if (games[i]) {
            const stageName = userGames[k].stageName;
            const update = Object.assign({stageName}, Helpful.pick(games[i], 'label', 'gameTime')) as UserGameEntry;
            o[k]=update;
          }
          else o[k]=null;
          return o;
        }
        ,{} as UserGames);
        // console.log("2: validateGames$, validated=", validated);
        return validated;
      }),
      tap( validated=>{
        // update Subject and firebase
        this._userGames$.next(validated);
        const {uid} = this._subscriptions;
        this.db.object<Game>(`/userGames/${uid}`).update(validated);
        return validated;
      }),
    ).subscribe();
  }

  public getGames$(uid:string):Observable<UserGames> {
    const THROTTLE_TIME = 60*60*1000;
    if (uid && uid!=this._subscriptions.uid) {
      this._subscriptions.sub && this._subscriptions.sub.unsubscribe();
      // console.log("2: getGames$, watching uid=", uid)
      const sub = this.db.object<UserGames>(`/userGames/${uid}`).valueChanges()
      .pipe(
        tap( o=>{
          this._userGames$.next(o);
        }),
        throttleTime(THROTTLE_TIME),
        tap( o=>{
          this.validateGames();
        })
      ).subscribe();
      this._subscriptions = {uid, sub};
    }
    // console.log("2: getGames$()")
    return this._userGames$.asObservable();
  }
  public setGame(uid:string, gid: string, g:UserGameEntry = null):Promise<void> {
    return this.db.object<UserGames>(`/userGames/${uid}`).update( {[gid]:g} );
  }
  public updateUserGameEntry(gid:string):Promise<void> {
    // TODO: how do we update UserGameEntry when the game changes?
    return
  }

}
