import { Injectable } from '@angular/core';
import { AngularFireDatabase, AngularFireObject} from 'angularfire2/database';
import * as firebase from 'firebase/app';

import { Observable, } from 'rxjs';
import { take, first, } from 'rxjs/operators';

import { FishbowlHelpers } from './fishbowl.helpers';
import { 
  Game, GameWatch, GameDict, GameAdminState, RoundEnum,
} from './types';

export interface GamePackWord {
  word: string;
  level?: number;
}

export interface GamePack {
  [id:string]: GamePackWord[]
}

const GAMEPACK_KEY = '_GamePacks_';
const GAME_PACK_RAW = {
  'animals': [
    'Aardvark','Anteater','Bumble Bee','Cheetah', 'Elephant','French Poodle', 'Giraffe', 'Gorilla', 'Tiger', 'Lion', 'Penguin', 'Polar Bear', 'Peacock', 'Pelican', 'Zebra', 'Meercat', 'Gazelle', 'Rhinoceros', 'Panda Bear', 'Gopher', 'Hamster','Hippopotamus',
    'Simba', 'Timon', 'Poombah', 'Nemo', 'Dory', 'Flounder', 'Scuttle', 'Sebastian', 'Toto', 'Old Yeller', 'Sonic the Hedge Hog', 'Donkey Kong', 'Flipper', 'Lassie', 'Snoopy', 'Scooby Doo', 'Pink Panther', 'Yogi Bear', 'Punxsutawney Phil',
    'Bugs Bunny', 'Road Runner', 'Woody the Woodpecker', 'Rudolph', 'Dumbo', 'Porky Pig', 'Tweety Bird', 'Hachiko', 'Bagheera', 'Abu', 'Angry Birds', 'Secretariat', 'Miss Piggy', 'Unicorn',
    'Starfish', 'Goldfish', 'Pufferfish', 'Electric Eel', 'Great White Shark', 'Stingray', 'Blue Whale', 'Orca', 'Dolphin', 'Octopus', 'Squid', 'Turtle', 'Whale Shark', 'Sea Urchin', 'Tuna', 'Narwhal',
    // 'Humuhumu Nukunuku Apua\'a', 'Timothy Q. Mouse', 'Tom & Jerry', 
  ]
}


@Injectable({
  providedIn: 'root'
})
export class GamePackService {

  constructor(
    private db: AngularFireDatabase,
  ) { }

  setWords(gamePackId:string, words:string[]=[]){
    words = words || GAME_PACK_RAW[gamePackId];
    let gamePackRef = this.db.object<any>(`/${GAMEPACK_KEY}`);
    const LEVEL = 1
    let gamePackWords = words.reduce( (o,word)=>{
      let key = this.db.createPushId()
      o[key] = { word, level:LEVEL }
      return o;
    },{});
    let update = { [gamePackId]: gamePackWords };
    gamePackRef.update( update )
  }

  async getWords(quickPlay:string, level:number=99){
    if (!quickPlay) return null;
    let gamePackWordsRef = this.db.object<GamePackWord>(`/${GAMEPACK_KEY}/${quickPlay}`);
    let gamePackWords = await gamePackWordsRef.valueChanges().pipe( first() ).toPromise();
    let words = Object.entries(gamePackWords || {}).filter( ([k,v])=>v.level<=level).map(([k,v])=>v.word );
    return !!words.length ? words : null;
  }
}
