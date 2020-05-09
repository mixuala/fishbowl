import { NgModule } from '@angular/core';
import { Routes, RouterModule, UrlSegment } from '@angular/router';

import { EntryPage } from './entry.page';
import { GameSettingsPage } from './game-settings.page';

/*
/app/games
/app/entry/:gameId
/app/entry/:gameId/entry
/app/entry/:gameId/settings
/app/entry/new

/app/game/:gameId                                           (game.players or game.checkIn)
/app/game/:gameId/entry    => /app/entry/:gameId/entry      (playerId)
/app/game/:gameId/settings => /app/entry/:gameId/settings   (game.moderators)
/app/game/new
*/


export function SettingsMatcher(segments, group, route){
  // console.log("settings: ", segments)
  let last = group.segments[group.segments.length-1];
  return last && last.path == "settings" ?  {consumed: [] } : null;
}

export function PlayerMatcher(segments, group, route){
  // console.log("player: ", segments)
  let last = group.segments[group.segments.length-1];
  return last && last.path == "player" ?  {consumed: [] } : null;
}


export const routes: Routes = [
  // e.g. `/app/entry/[gameId]/settings`
  {
    // path: `/app/game/[gameId]/settings`,
    matcher: SettingsMatcher,
    component: GameSettingsPage
  },
  {
    // path: `/app/game/[gameId]/player`,
    matcher: PlayerMatcher,
    component: EntryPage
  },
  {
    path: 'settings',
    component: GameSettingsPage
  }, 
  {
    path: 'entry',
    component: EntryPage
  },
  {
    path: '',
    redirectTo: 'entry',
    pathMatch: 'full'
  }  
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class SetupPageRoutingModule {}
