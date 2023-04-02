Fishbowl App

changelog fixes:
- Since ngOnDestroy() might not fire when you navigate from the current page, we will use `ionViewWillLeave()` to cleanup Subscriptions.


CLOUD UX event loop
players lounge
- player checkin
- activeGame event
setup
- team assignments, changed.includes('doTeamRosters')
gameplay
- hasSpotlight event, changed.includes('spotlight')
- beginPlayerRound (same as start Timer?)
  - changed.includes('playerRoundBegin')
- start Timer, changed.includes('isTicking')
- pause Timer, changed.includes('timerPausedAt')
- wordAction, changed.includes('log')
- ??? gameLogChangedByAuditorClick, changed.includes('log')
- onTimerDone, changed.includes('playerRoundComplete')
  - ??? overtime timer done
- begin Game Round


LOCAL UX event loop (player)
- player checkin
- volumeClick()
- goPlayerSettingsClick() // player settings
- beginChangePlayerClick() // prepare to changePlayer
  - showChangePlayerInterstitial:doPlayAsClick()

LOCAL UX event loop (spotlight)
- beginPlayerRound

LOCAL UX event loop (spotlight+moderator)
- startTimer
- pauseTimer
- wordAction
- onTimerDone
- overtime Timer done
- gameLogChangedByAuditorClick()
- onTimerClick()  // start/pause timer
- onWordActionClick() // OK/pass teleprompter
- gameLogChangedByAuditorClick() - ???: allow spotlight player privileges


LOCAL UX event loop (admin)
- resetGameClick()
- doCheckInClick()
- toggleStashClick()
- gameStateToggle() // doPassThePhone
- timerRangeChangeClick()
- goGameSettingsClick()
- checkInPlayerToggle()
- teamRosterChangeClick()
- showTeamRosterClick()
- loadRoundClick()
- beginGameRoundClick()



Refactor

moderator actions:
  - goGameSettingsClick()
  - toggleStashClick()
  - gameStateToggle() // doPassThePhone
  - resetGameClick()
  - doCheckInClick()
  - checkInPlayerToggle()
  - loadRoundClick()
  - teamRosterChangeClick()
  - showTeamRosterClick()
  - beginGameRoundClick()
  - timerRangeChangeClick()

moderator+spotlight player actions:
  - beginPlayerRoundClick() // begin player round
  - onTheSpotClick() // scroll to teleprompter
  - onTimerClick()  // start/pause timer
  - onWordActionClick() // OK/pass teleprompter
  - gameLogChangedByAuditorClick() - ???: allow spotlight player privileges


spotlight player actions:
  - showBeginPlayerRoundInterstitial:spotlightPlayerReadyClick() 
                                    // same as beginPlayerRoundClick()

ANY player click
  - beginChangePlayerClick() // prepare to changePlayer

all player actions:  
  - showChangePlayerInterstitial:doPlayAsClick()
  - volumeClick()
  - handleStageNameSearchbarChanged()
  - goPlayerSettingsClick() // player settings



- cloud event loop/handlers together
- init/lifecycle events together
- refactor all methods with guards for this.isModerator() or this.hasSpotlight('player'/team)

Re-architect
- local events => local UX handler, including sounds, timer
- post all state changes to cloud with prev state & ownerId
  - filter cloud state changes, exclude current ownerId (already handled)
  - dismiss cloud state changes where prev state does not match
- cloud functions?

### TikTok onboarding
Players:
* Join a game
  PreGame:
  1. open invite
  2. Game Entry: Name + 3 words
  3. wait until gameDay, 
    - see who else has joined (TODO)

  GameDay: 
  
  - ??? problem: need invite link on 2 devices, how to make easy
  1. goto Fishbowl, find/open game
    * sometimes hard to find in a chat stream
    * save to local storage?
  1. hang out in the PlayersLounge
    - open zoom & hang out
    - find your GameEntry, if on a different device (TODO)
      * dont show words when assuming playerId
    - wait for "checkIn" screen
  1. CheckIn to begin gamePlay
  1. review/adjust teams, 
    * show TeamRoster as BeginPlayerRound Interstitial
    * know your team color!
    * watch the zoom spotlight and be ready for clues
  1. Spotlight Player:
    - hit the [ready] button to begin your playerRound
    - go crazy




### bugs
BUGS:
- game-page:618 exception onGameOver???
    - if (!round) throw new Error("round should not be empty when playerRoundComplete==true")

- validate gameIds in userGames
- [OK/Submit] for player/settings
x- fix onTakePlayerIdentity(), exception on stagename, doesn't show clues
X- a player submits a new entry, causes other players with open entries to reload the page and lose data
x- create new game is not added to UserGames
x- moderator/new game not asked to submit entry [Review Game Entry] should be [submit Game Entry]
x- moderator calls move spotlight a 2nd time when [change Player] is playing as moderator
x- moveSpotlight fixes
  x- after PlayerRoundComplete, teleprompter should say [done] says [start]
  x- long delay until GameRoundComplete
- PlayersLounge, review game entry for "null"
- beginRound, moderator pushes gamePlay.log={}, doesn't appear in cloud gamePlayState

x- moderator timer shows NaN after moveSpotlight
o- beginRound suppresses first Help interstitial (beginRound) but not 2nd, beginPlayerRound
o- do NOT show beginRound Interstitial if isTicking==true 
o- stash.isActivePage is false when waking the computer. how do we detect and reload page?
o- gameOver event does not render game score in final view, must reload




x- team background not updating because this.player$.value.teamName is null after wake from LONG sleep, call setGamePlayer()
  x- trigger reload when GameHelpers.gamePlay$.getValue() is null, use this.onTheSpotTeam
x- timer ChangeDetection/SKIP: not skipping repeated timers, update change detection from component PARENT
  x- moderator/localhost timer/sync is resetting
x- timer [start] flashes between doPlayerRoundComplete and moveSpotlight/doBeginPlayerRound
x- wordAction complete does NOT stop timer
x- ScoreCard component does not resort
x- moderator timer shows NaN on prod code when opened with elapsed
x- stopAtZero not working during overtime for cloud clients, CountdownTimer stopAtZero not always working
x- Timer is NaN on reload
x- mutate gameplaySpotlight for change detection
x- play sound delay
x- play sound=buzz when starting timer, wordResult===undefined
x- beginPlayerRound before PlayerRoundComplete 
x- playerRoundBegin loads multiple times. throttle? ghost subscribers?
x- moderator Timer resets when toggled open/close WITHOUT reload
x- resetGame does not reset scoreboard, must reset GameHelpers.gameLog$
x- moderator timer sometimes resets on wordAction
x- overtime click resets Moderator Timer, or stopAtZero not working, maybe system memory error
x- after cloud reload/bootstrap, next wordAction resets Timer, set CountdownTimer.timerOptions from duration setter() 
x- wordAction cloud gamePlay.timer is changed, should not be so
x- cloud timers are not starting
  x- check isBootstrap > elapsed
x- local gamePlay update does not get the updated scoreboard, added changed.includes('playerRoundComplete');
x- move spotlight fails on [beginRound]

o- dismiss interstitial while paused emits a "woof" sound
x- round.entries not updated correctly from gameLog
  x- getGamePlay() rid != activeRound because of closure, wrong round.entries updated
x- playerRoundComplete skipped for spotlight
  x- beginNextRound does not follow
x- spotlight not set on [BeginRound]
x- moderator can pause, but not start timer
x- after hard reset, clients are not running "doCheckIn", wrong gamePlay.rid
x- race condition with network>3G, player==null
x- [start] playerRound button plays a "buzz" sound for moderator, should be click


x- timer stopAtZero is NOT working sometimes, clock sometimes resets to seconds for Moderator 
x- clients have wrong time => need to sync with common time server
  x- moderator fires timerStop/overtime BEFORE laggy client, that take precedence
x- start countdownTimer locally for spotlight player
x- playerRoundBegin seems to start the timer automatically, on moderator 
x- playerRoundBegin [start] does not start the timer on spotlight
x- after PlayAsAlias, you don't see the beginPlayerRound interstitial
x- playAsAlias should return to original player AFTER playerRound is complete.





x- round number is null for playerRoundComplete
x- timer (cloud) renders impossibly large number. make sure timer renders max {seconds}
x- next player bug appears with VERY high latency on network

x- player round complete scoreboard flashed again for the next player(?) or playingAsId player?

- moderator DQ after buzzer made it to screen, but not DB
- Only one timer is animating for the moderator. usually the moderator, or the first??
- one player launched BeginRound interstitial twice
- SOMETIMES PWA freezes, after returning to foreground state
- SOMETIMES timer duration doesn't get set from range control for other players, only works between rounds
- couldn't swap teams unless reload

- test "soft" reset to return game to a clean state
- one player did not follow the spotlight change, was able to see the clues
- sometimes the timer showed the wrong number when ticking down
  - however the buzzer seemed to fire at the correct time

x- consistently implment game.doPassThePhone toggle outcomes 
x- rename [ready] to [start], just use [start] button in dialog
x- update Rounds in patchPlayerId()
x- GameOver reload does not change spotlight/team
x- movePlayerSpotlight() still not working with latency
  x- use gameLog to get last spotlight state, 
  x- push gameLog entry for each BeginPlayerRound
x- moveSpotlight fails for FIRST player only
x- skip player SPOTLIGHT doesnt work in TeamRoster
x- teamRoster layout fails with long names
x- when first player checksIn, all checkIn interstitials dismiss
x- HIGHLIGHT [READY] button, or use a modal to start the round
x- player turns still do not work, check gamePlay.spotlight state before pushing update
x- better "lobby", people still unsure what to expect on entry
x- moderator should not redirect to player settings when activeGame=false
x- gameRoundComplete is not firing until AFTER overtime
x-words remaining =1 at end of round, can't click [beginRound]
x- SOMETIMES spotlight changes BEFORE playerRoundComplete has a chance to show. 
x- invite links to private games do not show up
x- timer animation missing for normal players
x- gameRoundComplete => beginRound transition is flakey
x- highlight input fields on entry for ios
x-team roster losing spotlight, use changeDetection
x- handle only 1 player checkIn
x- this.gameWatch undefined after play as Guest
x- playerRoundComplete is firing twice. why?
x- buzzer does not call onTimerStop if click is too close to expiration. check throttleTimeAndWordEvents()
x- moderator does not need an entry
x- player round summary should list spotlight player
x- moderator cannot begin round if spotlight is not set
x-last playerRound scoreboard disappears too fast, sent away by gameRoundComplete scoreboard
x- beginNextGameRound() should move spotlight
x- playerRound scoreboard should highlight team colors
x- player.teamName unset, after [begin round] now copying from lastGamePlay and lastRound
x- moderator should be able to start/pause/reset timer
  x- moderator actions fail if the spotlight player does NOT fire playerRoundComplete, etc.
  x- throttle LOCAL actions based on cloud triggers, so Moderator and Spotlight don't duplicate clicks
x- player/moderator OK/PASS clicks repeated, only allow one click per word
x- game.uid is empty. it should be.
x- beginRound, round is undefined
x- losing spotlight on beginRound, team bkg doesn't work until reload
x- push scoreboard update before interstitials ending round/game
x- score not updated in INTERSTITIAL correctly on gameRoundComplete? OK on scoreboard
x- timer not initalized correctly after reload, beginRound?
x- checkin only worked after load rounds
x- teams got scrambled between rounds, copy teams between rounds
x- gameRoundComplete did not did not complete.
x    => after Round3, did not show gameComplete and final score
x    => Round2/3 did not begin correctly
x- add the ZOOM link to the game BEFORE start time. make sure players can open ZOOM easily
x - clues sometimes appeared twice in the same round. use "Shuffle", not "Random" to pick clues
x- timerBadge does not update from range?
x- [beginRound] does NOT work for round2
x- DO NOT reset game startTimes for real games
x- overtime: gameRoundComplete, but cannot start new round
x- lastword in overtime does not update remaining correctly
x- lastword in overtime does not complete round properly
o- spotlight position should copy to nextRound

features:
x- current player CONTINUES TURN after gameRoundComplete, do not fire playerRoundComplete
  x- don't moveSpotlight after gameRoundComplete if remaining time > 10sec
x- find game by game code, 4 chars
x- manage stageNames
- web: shrink browser window to 320px wide
- determinate wordAction (firebase fuction)
- save TimerDuration to localStorage, or use serverTime
o-checkIn players mid-round, add to round.teams
- add SocialSharing 
- add pregame Chat to encourage entries. or "social share" game entry
- list games/player Name(s) in Profile
- OVERTIME click by modal popup. only moderator/spotlight can respond, "did you get a point?" YES/NO
- [pass] with next.remaining=1 should Toast with "last word" message
?- moderator control panel: add latecomer to game, TEST: at beginning of next round
- highlight words remaining BEFORE the player round begins

x- [OK] not [submit] after Entry
x- add autoFill
x- 3-5 words, or just extra words
x- "QuickPlay/Instant", GamePack, "Animals" Edition. preset game words, like HeadsUp
x- better copy for claiming name/entry. use [find player]
x- moderator can fire CheckIn interstitial manually
x- TECH notes: can't play with only 1 phone, can stream video when the App is in foreground
x- share phone feature, multi players on same device, assume ID
x - add FB Page linke
x- add window.location reload after GAME OVER dismissal
x- show PlayersLounge "chill" box in game before isGameOpen
x- some players did not see the check-in screen. had to reload page. maybe add a reload timer until check-in?
x- need back button AFTER entry,
x- allow extra time for Round3, hard to hit buttons while acting
x- need to confirm Entry with Toast
x- PWA
x- add quick game overview
x- assume playerId by entry.name/displayName
x- [beginGameRound] => interstitial => nextPlayerRound
x- public/private listing
x- show/edit player assignments for teams
x- Validate unique player displayNames in entry
x- need "waiting for game to begin" screen
x- for live games, join game BEFORE prompt for entries. allow players to launch video chat before entry
x- moderator can edit results at the end of the player round, fix accidental clicks
x- safari scrolls to top after each [ok/pass]
x- safari does not show class.on-the-spot highlights
x safari timer CSS does not reset with class.on-the-spot=false
x- reload page when gameTime countdown fires
x- add team names
x- sort player checkin 
x- hide checkin from moderator control panel after complete [load rounds]
x- add a moderator control panel
  x- moderator can hit [OK] when the answer is heard
  x- moderator hits [PASS] when the spotlight/giver says a word in the clue, like "sesame street"
x- remove/hide "hidden" people
x- add new button for moderator to nav to game settings
x- create/edit game, /game/uid/settings page
x- moderator or spotlight/giver should be able to click button on last clue AFTER the buzzer.
  x- maybe allow an extra 5 seconds
x- stop timer silently on playerRoundWillComplete
x- round=complete round score credited to the FOLLOWING round. delay round increment
x- interstitial timing, add delay between state changes
x- error message, name missing
x- load round error on Taco Tuesday
x- ZOOM LINK VALIDATION:  REQUIRES QUERY STRING

### feature requests 
- add GameRoundBegin dismiss to localstorage, ignore on page reload
- add latecomer to game
- audio drop out when multiple people talking
x- missed final [ok] before timer expired and didn't get the point, keep scores up at the end of the round
x- user check-in before LoadRound, use interstitial with close button
x- interstitials
x- after playerRound: show .round-scores
x- GameMasterPage, and role, create/edit Game settings
x- invite redirect



day of week teams: 

```
let roundUpdate = {
  teams : {
    "blue team": ["JJM3Ct3iPzNR8gMy5DkSZB5UdOn2","tRIagpG1P5ToB4jhxMzGghQKbNx2","enJzDKGvvoQPTONESYGN03cVYPZ2","8seIMvmHXBSvAo07scJxaeKxhFI3"],
    "red team": ["qOMioJk9BRbgK5ViqLRePxIAt3D3","nhjC74LbBNdRBV5rkAosmu9tPrF2","aCMCLiQmcBRRUFZmH0GmWi9LF202"]
    }
}

```



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