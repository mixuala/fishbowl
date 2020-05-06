import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

const routes: Routes = [
  {
    path: '',
    redirectTo: '/app/list',
    pathMatch: 'full'
  },
  {
    path: 'walkthrough',
    loadChildren: () => import('./walkthrough/walkthrough.module').then(m => m.WalkthroughPageModule)
  },
  {
    path: 'getting-started',
    loadChildren: () => import('./getting-started/getting-started.module').then(m => m.GettingStartedPageModule)
  },
  {
    path: 'auth/login',
    loadChildren: () => import('./login/login.module').then(m => m.LoginPageModule)
  },
  {
    path: 'auth/logout',
    loadChildren: () => import('./login/login.module').then(m => m.LoginPageModule)
  },
  {
    path: 'auth/signup',
    loadChildren: () => import('./signup/signup.module').then(m => m.SignupPageModule)
  },
  // tslint:disable-next-line:max-line-length
  {
    path: 'auth/forgot-password',
    loadChildren: () => import('./forgot-password/forgot-password.module').then(m => m.ForgotPasswordPageModule)
  },
  {
    path: 'app',
    loadChildren: () => import('./tabs/tabs.module').then(m => m.TabsPageModule)
  },
  {
    path: 'contact-card',
    loadChildren: () => import('./contact-card/contact-card.module').then(m => m.ContactCardPageModule)
  },
  // tslint:disable-next-line:max-line-length
  {
    path: 'forms-and-validations',
    loadChildren: () => import('./forms/validations/forms-validations.module').then(m => m.FormsValidationsPageModule)
  },
  {
    path: 'forms-filters',
    loadChildren: () => import('./forms/filters/forms-filters.module').then(m => m.FormsFiltersPageModule)
  },
  {
    path: 'page-not-found',
    loadChildren: () => import('./page-not-found/page-not-found.module').then(m => m.PageNotFoundModule)
  },
  {
    path: 'showcase',
    loadChildren: () => import('./showcase/showcase.module').then(m => m.ShowcasePageModule)
  },
  {
    path: '**',
    redirectTo: 'page-not-found'
  },
  // {
  //   path: 'entry',
  //   loadChildren: () => import('./fishbowl/entry/entry.module').then( m => m.EntryPageModule)
  // }
];
@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
