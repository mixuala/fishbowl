import { Component, OnInit, ViewChild } from '@angular/core';
import { Validators, FormGroup, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MenuController, ToastController } from '@ionic/angular';

import { AuthService } from '../services/auth-service.service';
import { environment } from '../../environments/environment';

declare let window;

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: [
    './styles/login.page.scss'
  ]
})
export class LoginPage implements OnInit {
  loginForm: FormGroup;
  errorResponse:string;

  validation_messages = {
    'email': [
      { type: 'required', message: 'Email is required.' },
      { type: 'pattern', message: 'Enter a valid email.' }
    ],
    'password': [
      { type: 'required', message: 'Password is required.' },
      { type: 'minlength', message: 'Password must be at least 6 characters long.' }
    ]
  };

  @ViewChild('submitBtn',{static:false})  submitBtn:any;

  constructor(
    private activatedRoute: ActivatedRoute,
    public router: Router,
    public menu: MenuController,
    public toastController: ToastController,
    private authService:  AuthService, 
  ) {
    this.loginForm = new FormGroup({
      'email': new FormControl('', Validators.compose([
        Validators.required,
        Validators.pattern('^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+.[a-zA-Z0-9-.]+$')
      ])),
      'password': new FormControl('', Validators.compose([
        Validators.minLength(6),
        Validators.required
      ]))
    });

    if (environment.production==false) {
      this.loginForm.setValue({
        email: 'test@test.com',
        password: ''
      });
    }

  }

  ngOnInit(): void {
    this.menu.enable(false);
    if (window.location.pathname == '/auth/logout'){
      this.authService.doLogout().then( ()=>{
        this.router.navigate(['/auth/login', {msg: "You are logged out"}]);
      })
    }
  }

  ionViewDidEnter(){
    this.errorResponse = null;
    let msg = this.activatedRoute.snapshot.paramMap.get('msg');
    if (msg) {
      this.presentToast(msg)
    }
  }

  /**
   * called by password onBlur
   */
  doSubmit(){
    let isComplete = !!this.loginForm.get('email').value && !!this.loginForm.get('password').value
    let isReady = this.submitBtn.disabled==false;
    if (isComplete && isReady) {
      this.authService.doLogin(this.loginForm.value).then( u=>{
        if (!!u) this.router.navigate(['']);
      })
      .catch( err=>{
        this.errorResponse = err
      });
    }
  }

  doLogin(): void {
    this.authService.doLogin(this.loginForm.value).then( u=>{
      if (!!u) this.router.navigate(['']);
    })
    .catch( err=>{
      this.errorResponse = err      
    });
  }

  goToForgotPassword(): void {
    console.log('redirect to forgot-password page');
  }

  async presentToast(msg) {
    const toast = await this.toastController.create({
      message: msg,
      position: "top",
      animated: true,
      color: "success",
      duration: 2000
    });
    toast.present();
  }

}
