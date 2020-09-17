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
    'Aardvark','Anteater','Bumble Bee','Cheetah', 'Elephant','French Poodle', 'Giraffe', 'Gorilla', 'Tiger', 'Lion', 'Penguin', 'Polar Bear', 'Peacock', 'Pelican', 'Zebra', 'Meercat', 'Gazelle', 'Rhinoceros', 'Panda Bear', 'Gopher', 'Hamster','Hippopotamus', 'Unicorn',
    'Simba', 'Timon', 'Poombah', 'Nemo', 'Dory', 'Flounder', 'Scuttle', 'Sebastian', 'Toto', 'Old Yeller', 'Sonic the Hedge Hog', 'Donkey Kong', 'Flipper', 'Lassie', 'Snoopy', 'Scooby Doo', 'Pink Panther', 'Yogi Bear', 'Punxsutawney Phil',
    'Bugs Bunny', 'Road Runner', 'Woody the Woodpecker', 'Rudolph', 'Dumbo', 'Porky Pig', 'Tweety Bird', 'Hachiko', 'Bagheera', 'Abu', 'Angry Birds', 'Secretariat', 'Miss Piggy', 'The Cowardly Lion',
    'Starfish', 'Goldfish', 'Pufferfish', 'Electric Eel', 'Great White Shark', 'Stingray', 'Blue Whale', 'Orca', 'Dolphin', 'Octopus', 'Squid', 'Turtle', 'Whale Shark', 'Sea Urchin', 'Tuna', 'Narwhal',
    // 'Humuhumu Nukunuku Apua\'a', 'Timothy Q. Mouse', 'Tom & Jerry', 
  ],
  'person':[
    'Homer Simpson', 'Marge Simpson', 'Sherlock Holmes', 'Mr Watson', 'Captain Ahab', 'Cinderella', 'Sleeping Beauty', 'Mulan', 'Snow White', 
    'Prince Charming', 'Dr Dolittle', 'Captain Nemo', 'Ward Cleaver', 'The Wizard of Oz', 'The Wicked Witch of the West', 
    'Austin Powers', 'James Bond', 'Daenerys', 'Tyrion Lannister', 'Hodor', 'Batman', 'Superman', 'Bruce Wayne', 'Clark Kent', 
    'Lois Lane', 'The Joker', 'Wonder Woman', 'Elmer Fudd', 'Cruella De Vil', 'Maria Von Trapp', 'Hannah Montana', 'The Fonz', 'Alex Trebek',
    'Lady Gaga', 'Hercules', 'Mr Spock', 'Richard Nixon', 'Santa Claus', 'The Grinch', 'Little Cindy Lou Who', 'The Big Bad Wolf', 
    'Benjamin Button', 'Napoleon', 'Harry Potter', 'Hermione', 'Bilbo Baggins', 'Gollum', 'Captain Jack Sparrow', 
    'Darth Vader', 'Chewbacca', 'Yoda', 'Muhammad Ali', 'Colin Kaepernick', 'Cleopatra', 'Joan of Arc', 
    'Juggler', 'Contortionist', 'King Tut', 'Frankenstein', 'Count Dracula', 'Buffy the Vampire Slayer', 'Godzilla', 'King Kong', 
    'Merlin', 'King Arthur', 'Robin Hood', 'Emperor Nero', 'Peter Pan', 'Tinker Bell', 'Princess Peach', 'Bowser', 'Hester Prynne', 
    'Amelia Earhart', 'Illuminati', 'Knights of the Round Table', 
  ],
  'place': [
    'Mount Rushmore', 'Mt Everest', 'Mt Olympus', 'Mt Fuji', 'Route 66', 'Hollywood', 'Las Vegas', 'Disneyland', 'Cinderellas Castle', 
    'Main Street', 'Grand Canyon', 'Yosemite', 'Yellowstone Park', 'Old Faithful', 'Mt Vesuvius', 'Pompeii', 'Misisippi River', 
    'Amazon River', 'Nile', 'Alexandria', 'Bourbon Street', 'The Everglades', 'The Continental Divide', 'The Great Wall', 
    'Northwest Passage', 'Victoria Falls', 'Niagra Falls', 'Mariana Trench', 'Kings Landing', 'Winterfell', 'Central Perk', ' London Eye', 'Hogwarts',
    'Big Ben', 'Madison Square Garden', 'Empire State Building', 'Eifel Tower', 'The Colosseum', 'Great Pyramids of Giza', 'Taj Mahal', 'The Sphinx', 'The Forbidden City',
    'Machu Picchu', 'Leaning Tower of Pisa', 'Stonehenge', 'Panama Canal', 'Golden Gate Bridge', 'Bhosphorus Strait', 'Red Sea', 'Suez Canal', 'Constantinople',
    'The Great Pacific Garbage Patch', 'Shibuya Crossing', 'Great Barrier Reef', 'El Capitan', 'Sydney Opera House', 'Statue of Liberty', 'Ankor Wat',
  ],
  'thing':[
    'Pogo Stick', 'Hula Hoop', 'Jump Rope', 'Frisbee', 'Bowling Pin', 'Basketball', 'Football', 'Baseball Bat', 'Trampoline', 'Jumpy Castle', 'House of Cards', 'Monkey Bars',
    'Boxing Gloves', 'Shuttlecock', 'Tennis Ball', 'Monster Truck', 'Motorcycle', 'Scooter', 'Rollerblades', 
    'Unicycle', 'Tricycle', 'Water Balloons', 'Diving Board', 'Trapeeze', 'Pole Vault', 'Beach Volleyball', 'Kayak', 'Standup Paddleboard', 
    'Surfboard', 'Skateboard', 'Snowboard', 'Scuba Tank', 'Snorkel', 'Dumbbell', 'Yoga Ball', 'Treadmill', 'Stairmaster', 
    'Rowing Machine', 'Climbing Wall', 'Stopwatch', 'Hour Glass', 'Compass', 'Umbrella', 'Sunglasses', 'Telescope', 'Binoculars', 
    'Microscope', 'Monocle', ' Kimono', 'Tuxedo', 'Top Hat', 'Bow Tie', 'High Heels', 'Scrunchie', 'Corset', 'Mascara', 'Lipstick',  'Jimmy Choo Shoes',
    'Charm Bracelet', 'Bouquet', 'Popcorn', 'Cracker Jacks', 'Pepperoni Pizza', 'Martini Glass', 'Corkscrew', 'Bottle Opener', 
    'Everything Bagel', 'English Muffin', 'Curly Fries', 'California Roll', 
    'Lollipop', 'Jawbreaker', 'Pop Rocks', 'Granola', 'Energy Bar', 'Instant Ramen', 'Milk Bottle', 'Mardi Gras', 'Carnival', 
    'Ferris Wheel', 'Merry-go-round', 'Coral Reef', 'Blindfold', 'Hot Tub', 'Iron Man Triathlon', 'Synchronized Swimming', 'Curling', 'Half Pipe', 
    'Flip Phone', 'Rotary Phone', 'Pinball Machine', 'Yo-yo', 'Typewriter', 'Floppy Disk', 'Payphone', 'Answering Machine', 'Tape Recorder', 'Vinyl Record', 'Pager', 'Polaroid',
    'Instapot', 'Birthday Cake', 'Muffin Top', 'Love Handles', 'Rubiks Cube', 'Slinky', 'Play Doh', 'Beanie Baby', 'Rubber Band', 'Oragami Crane',  
    
  ]
}


@Injectable({
  providedIn: 'root'
})
export class GamePackService {

  constructor(
    private db: AngularFireDatabase,
  ) { }

  setWords(gamePackId:string, words:string[]=null){
    words = words || GAME_PACK_RAW[gamePackId] || [];
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
