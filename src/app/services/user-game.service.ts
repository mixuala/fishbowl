import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireObject, AngularFireList} from 'angularfire2/database';
import * as dayjs from 'dayjs';
import { Observable } from 'rxjs';
import { UserGameEntry, UserGames } from '../fishbowl/types';

@Injectable({
  providedIn: 'root'
})
export class UserGameService {

  constructor(
    private db: AngularFireDatabase,
  ) { 
    
  }

  public getGames$(uid:string):Observable<UserGames> {
    return this.db.object<UserGames>(`/userGames/${uid}`).valueChanges();
  }
  public setGame(uid:string, gid: string, g:UserGameEntry = null):Promise<void> {
    return this.db.object<UserGames>(`/userGames/${uid}`).update( {[gid]:g} );
  }
}
