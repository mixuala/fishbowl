import { Component, OnInit, ViewChild } from '@angular/core';
import { Validators, FormGroup, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ModalController, MenuController, ToastController } from '@ionic/angular';

import { TermsOfServicePage } from '../terms-of-service/terms-of-service.page';
import { PrivacyPolicyPage } from '../privacy-policy/privacy-policy.page';
import { PasswordValidator } from '../validators/password.validator';

import { AuthService } from '../services/auth-service.service';

@Component({
  selector: 'app-signup',
  templateUrl: './signup.page.html',
  styleUrls: [
    './styles/signup.page.scss'
  ]
})
export class SignupPage implements OnInit {
  signupForm: FormGroup;
  matching_passwords_group: FormGroup;
  errorResponse:string;

  validation_messages = {
    'email': [
      { type: 'required', message: 'Email is required.' },
      { type: 'pattern', message: 'Enter a valid email.' }
    ],
    'password': [
      { type: 'required', message: 'Password is required.' },
      { type: 'minlength', message: 'Password must be at least 6 characters long.' }
    ],
    'confirm_password': [
      { type: 'required', message: 'Confirm password is required' }
    ],
    'matching_passwords': [
      { type: 'areNotEqual', message: 'Password mismatch' }
    ]
  };

  @ViewChild('submitBtn',{static:false})  submitBtn:any;

  constructor(
    private activatedRoute: ActivatedRoute,
    public router: Router,
    public modalController: ModalController,
    public menu: MenuController,
    public toastController: ToastController,
    private authService:  AuthService, 
  ) {
    this.matching_passwords_group = new FormGroup({
      'password': new FormControl('', Validators.compose([
        Validators.minLength(6),
        Validators.required
      ])),
      'confirm_password': new FormControl('', Validators.required)
    }, (formGroup: FormGroup) => {
      return PasswordValidator.areNotEqual(formGroup);
    });

    this.signupForm = new FormGroup({
      'email': new FormControl('test@test.com', Validators.compose([
        Validators.required,
        Validators.pattern('^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+.[a-zA-Z0-9-.]+$')
      ])),
      'matching_passwords': this.matching_passwords_group
    });
  }

  ngOnInit(): void {
    this.menu.enable(false);
  }

  ionViewDidEnter(){
    this.errorResponse = null;
    let msg = this.activatedRoute.snapshot.paramMap.get('msg');
    if (msg) {
      this.presentToast(msg)
    }
  }

  async showTermsModal() {
    const modal = await this.modalController.create({
      component: TermsOfServicePage
    });
    return await modal.present();
  }

  async showPrivacyModal() {
    const modal = await this.modalController.create({
      component: PrivacyPolicyPage
    });
    return await modal.present();
  }

  doSignup(): void {
    this.authService.doRegister(this.signupForm.value).then( u=>{
      if (!!u) this.router.navigate(['']);
    })
    .catch( err=>{
      this.errorResponse = err      
    });
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
