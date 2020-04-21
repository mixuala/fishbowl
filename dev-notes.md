Fishbowl App


Requirements

game master
- create a game, unique game_id
  - add zoom/meets link to game
- forward game invitations as urls
- assign teams from players
  - random assignment
  - adjust team members
- publish team rosters 
  - default batting order
- set default timer value
- begin round
- referee/judging
  - PAUSE: discuss rules/violation/adjustments
  - PASS: flash [X] to all players on clue violation 
  - round adjustments:
    - forEach answer flashed: 
      - DQ for clue violation, judged as incorrect answer
      - PASS: wrong button push

players/teams
- join game from invitation link
  - add name
  - enter 3 nouns: person/place/thing
  - wait for team assignment 
- review team rosters
  - edit team name
  - edit batting order
- wait for gameplay/round to begin
  - show batter and ondeck
  - batter up clicks ready
    - wait for countdown to begin timer/round

Active player + game master screen
  - label: name/team
  - show active clue
  - PASS/CORRECT button
    - flash PASS/[CORRECT answer] to all players
    - different color when clicked by game master

Everyone else screen (read only)
- team color theme
- player on deck (opposite team)
- timer, scoreboard
- flash game action
- game log:
  [correct answer]
  "pass"



API
- create game:
  - game_id
  - video conference link
  - start time
  - invitation link

- join game/team:
  - player name
  - 3 clues
    - validation: unique
    - disallowed
    - too similar
  - team assignment(?)

- publish team rosters
  - team captains(?)
  - edit team name
  - batting order
  - submit

- synchronize for all players
  - game timers
  - scoreboard
  - flash game action
  - flash:
    - TOAST to all players, "pass" or "[correct answer]"
    - [x] clue violation

- clue:
  - shuffle clues, status=ready
  - flash clue, status=done
  - pass, status=ready or pass



Roles:
- game master
- team captain (?)
- player
- batter up

Pages:
- game master: setup
  - game_id
  - start time
  - video link
  - invitation link
  - players (count)

- player dashboard (onboarding)
  - name
  - 3 words
    - status: accepted/rejected
  - team assignment

- team dashboard
  - name
  - team roster (ordered list)

- game play (field)
  - scoreboard
  - at bat
  - timer
  - game log:
    - "pass"
    - [correct]

- game play (batter)
  - player/team name
  - timer
  - [pass]/[ok]

- game play (role=game master):
  - player/team name
  - timer
  - [pass]/[ok]
  - game log:
    - "pass"  [word] [ ] ok +1
    - "OK"    [word] [ ] DQ -1
  - [player/round complete] button 


Tabs (game master)
- Setup/Players/Teams/Words/Game Play

Tabs (players)
  - Player/Team/Game Play(batter/field)